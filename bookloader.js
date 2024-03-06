import HttpsProxyAgent from 'https-proxy-agent';
import fetch, {AbortError} from 'node-fetch';
import {writeFileSync, appendFileSync, existsSync, readFileSync, mkdirSync} from 'fs';
import { exit } from 'process';
import { JSONPath } from 'jsonpath-plus';
import { parseDocument, DomUtils } from 'htmlparser2';
import { selectAll } from 'css-select';
import render from 'dom-serializer';
import 'dotenv/config';

async function loadData(url, options) {
    let fetchInit = {
        headers: {}
    };
    if (options.accept) {
        fetchInit.headers['Accept'] = options.accept;
    }
    if (options.post) {
        const { contentType, body } = options.post;
        fetchInit.method = 'POST';
        fetchInit.headers['Content-Type'] = contentType;
        fetchInit.body = body;
    }
    else {
        fetchInit.method = 'GET';
    }
    if (options.proxy) {
        const proxyAgent = new HttpsProxyAgent(options.proxy)
        fetchInit.agent = proxyAgent;
    }
    if (options.userAgent) {
        fetchInit.headers['User-Agent'] = options.userAgent;
    }
    var response;
    for (var i = 5; i > 0; --i) {
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            controller.abort();

        }, 5000);
        fetchInit.signal = controller.signal;      
        try {  
            response = await fetch(url, fetchInit)
            const responseContentType = options.contentType || 
                (options.accept === 'application/json' ? 'json' : 'html')
            if (responseContentType == "json") {
                const responseJson = await response.json();
                //console.log(responseJson);
                clearTimeout(timeout);
                return responseJson;    
            }
            const responseText = await response.text();
            clearTimeout(timeout);
            return responseText;
        } catch (e) {
            if (i > 0 && e?.name === 'AbortError') {
                console.log('Timed out, retry...');
            }
            else {
                throw e;
            }
        }
    }
}

function formatURL(url, values) {
    let u = url;
    for (const [key, value] of Object.entries(values)) {
        u = u.replaceAll('${' + key + '}', s => {
            return value;
        });
    };
    return u;
}

function textReplace(text, replace) {
    return replace.reduce((allText, {regex, replace}) => {
        const re = new RegExp(regex);
        return allText.replace(re, replace);
    }, text);
}
/*    
function fixContentText(text, chapterName) {
    const fixArray = [
        {search: /ё&/ig, replace:'ё'},
        {search: /&ё/ig, replace:'ё'},
        {search: /&\./ig, replace:'ё.'},
        {search: /&,/ig, replace:'ё,'},
        {search: /\s?&м/ig, replace:'ём'},
        {search: / & /ig, replace:'ё '},
    ]
    fixArray.forEach(({search, replace}) => {
        text = text.replaceAll(search, substr => {
            console.log(`fix chapter "${chapterName}" "${substr}" -> "${replace}"`);
            return replace;
        });
    });
    return text;
}
*/
async function loadBookFb2({ bookName, book, baseURL, chapterList, chapters, proxy, bookDir, userAgent, loadDelay }) {
    
    const chapterListContentType = chapterList.contentType ||
        (chapterList.accept === 'application/json' ? 'json' : 'html');

    let chapterListHtml = '';
    let chapterListJson = {};
    const chapterListTypeDir = `${bookDir}/${chapterListContentType}`;
    if (!existsSync(chapterListTypeDir)) {
        mkdirSync(chapterListTypeDir);
    }
    const chapterListFilename = `${chapterListTypeDir}/${bookName}.${chapterListContentType}`; 
    const chapterListURL = formatURL(chapterList.URL, { bookName, baseURL });
    console.log(`loading chapter list from ${chapterListURL}`);
    let chapterListData = await loadData(chapterListURL, {
        ...chapterList, 
        proxy, 
        userAgent
    });
    if (chapterListContentType === 'json') {
        chapterListJson = chapterListData;
        chapterListData = JSON.stringify(chapterListJson);
    }
    else {
        chapterListHtml = chapterListData;
    }    
    console.log(`writing chapter list to ${chapterListFilename}`);
    writeFileSync(chapterListFilename, chapterListData);

    if (chapterList.book) {
        for (const [key, value] of Object.entries(chapterList.book)) {  
            if (chapterListContentType === 'json') {
                const {path, replace} = value;      
                const jpvalues = JSONPath({json: chapterListJson, path});
                if (jpvalues) {
                    if (key === 'genres') {
                        let genres = jpvalues;
                        if (replace) {
                            genres = genres.map(genre => textReplace(genre, replace));
                        }
                        book[key] = genres;
                    }
                    else if (jpvalues.length) {
                        book[key] = jpvalues[0];
                        if (replace) {
                            book[key] = textReplace(book[key], replace);
                        }
                    }
                }
            }
            if (chapterListContentType === 'html') {
                const dom = parseDocument(chapterListHtml);
                const { text, replace } = value;
                const elements = selectAll(text, dom);
                if (key === 'genres') {
                    let genres = [];
                    elements.forEach(el =>{
                        let elText = DomUtils.textContent(el);
                        if (replace) {
                            elText = textReplace(elText, replace);
                        }
                        if (elText) {
                            genres.push(elText);
                        }
                    });
                    book[key] = genres;
                }
                else {
                    book[key] = elements.reduce((allText, el) => {
                        const elText = DomUtils.textContent(el);
                        if (elText) {
                            return allText ? allText + '\r\n' + elText : elText;
                        }
                        return allText;
                    }, '');
                    if (replace) {
                        book[key] = textReplace(book[key], replace);
                    }
                }
            }
        }
    }

    const {author, description, genres, title, docId} = book;

    let bookChapters = [];

    if (chapters) {
        if (chapterListContentType === 'json') {
            if (chapters.path && chapters.URL) {
                const { path } = chapters;
                const jpvalues = JSONPath({json: chapterListJson, path});
                if (jpvalues && jpvalues.length) {
                    bookChapters = jpvalues;
                }
            }
        }
        if (chapterListContentType == 'html') {
            if (chapters.text && chapters.URL) {
                const dom = parseDocument(chapterListHtml);
                const { text, replace } = chapters;
                const elements = selectAll(text, dom);
                bookChapters = elements.map(el => DomUtils.textContent(el));
            }
            else if (chapters.attribute && chapters.URL) {
                const dom = parseDocument(chapterListHtml);
                const {name, tag, replace} = chapters.attribute;
                const elements = selectAll(tag, dom);
                bookChapters = elements.map(el => el.attribs[name]);
            }
        }
    }

    if (chapterList.reverseOrder) {
        bookChapters = bookChapters.reverse();
    }
    
    const genresXMLItems = genres.reduce((items, genre) => items + `\r\n        <genre>${genre}</genre>`, '');
    
    const docAuthor = '';
    const docDate = new Date().toISOString().split('T')[0]
    
    const bookDescription = `<description>
        <title-info>${genresXMLItems}
            <author>
                <first-name>${author}</first-name>
            </author>
            <book-title>${title}</book-title>
            <lang>ru</lang>
            <annotation>${description}</annotation>
        </title-info>
        <document-info>
            <author>${docAuthor}</author>
            <date value="${docDate}">${docDate}</date>
            <id>${docId}</id>
        </document-info>
    </description>`;
    
    const bookHeader = `<?xml version="1.0" encoding="utf-8"?>
    <FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:l="http://www.w3.org/1999/xlink">
    ${bookDescription}
    <body>
        <title><p>${author}</p><p>${title}</p><p></p></title>`;
    //    <section>
    //        <title><p>${title}</p></title>
    //        <p>Автор: ${author}</p><p></p>${description}
    //    </section>`;
    
    const bookFooter = `
    </body>
    </FictionBook>`;
    
    //const book = `${bookHeader}${bookFooter}`;
    //console.log(book);
    //writeFileSync(`${bookDir}/${bookName}.fb2`, book);
    
    writeFileSync(`${bookDir}/${bookName}.fb2`, bookHeader);
    
    function sleep(ms) {
        return new Promise((resolve) => {
          setTimeout(resolve, ms);
        });
    }

    for (const chapter of bookChapters) {
        const chapterURL = formatURL(chapters.URL, { bookName, baseURL, chapter });
        let chapterName = chapter;
        if (chapterName.endsWith('/')) {
            chapterName = chapterName.slice(0, -1);
        }
        else {
            const extRegEx = /\.[a-z]{2,5}$/i;
            chapterName = chapterName.replace(extRegEx, '');    
        }
        chapterName = chapterName.substring(chapterName.lastIndexOf('/')+1);
        //console.log(chapterName);

        if (!chapterName) continue;

        const chapterContentType = chapters.contentType ||
            (chapters.accept === 'application/json' ? 'json' : 'html');

        let chapterTitle = ''; 
        let chapterContent = '';

        let chapterHtml = '';        
        let chapterJson = {};
        const chaptersTypeDir = `${bookDir}/${chapterContentType}`;
        if (!existsSync(chaptersTypeDir)) {
            mkdirSync(chaptersTypeDir);
        }
        const chaptersDir = `${chaptersTypeDir}/${bookName}`;
        if (!existsSync(chaptersDir)) {
            mkdirSync(chaptersDir);
        }
        const chapterFilename = `${chaptersDir}/${chapterName}.${chapterContentType}`;        
        if (!existsSync(chapterFilename)) {
            // console.log(chapterFilename, 'NOT FOUND');
            console.log(`loading chapter from ${chapterURL}`);
            if (loadDelay) {
                await sleep(loadDelay);
            }
            let chapterData = await loadData(chapterURL, {
                ...chapters,
                proxy, 
                userAgent,
            });
            if (chapterContentType === 'json') {
                chapterJson = chapterData;
                chapterData = JSON.stringify(chapterJson);
            }
            else {
                chapterHtml = chapterData;
            }
            console.log(`writing chapter to ${chapterFilename}`);
            writeFileSync(chapterFilename, chapterData);        
        }
        else {
            console.log(`reading chapter from ${chapterFilename}`)
            const chapterData = readFileSync(chapterFilename);
            if (chapterContentType === 'json') {
                chapterJson = JSON.parse(chapterData);
            }
            else {
                chapterHtml = chapterData.toString();
            }
        }
        if (chapterContentType === 'json') {
            if (chapters.chapter && chapters.chapter.title) {
                const { path, replace } = chapters.chapter.title;
                const jpvalues = JSONPath({json: chapterJson, path});
                if (jpvalues && jpvalues.length) {
                    //chapterTitle = jpvalues[0];
                    const html = jpvalues[0];
                    const dom = parseDocument(html);
                    chapterTitle = DomUtils.textContent(dom);
                }
                if (replace) {
                    chapterTitle = textReplace(chapterTitle, replace);
                }
            }
            if (chapters.chapter && chapters.chapter.content) {
                const { path, replace } = chapters.chapter.content;
                const jpvalues = JSONPath({json: chapterJson, path});
                if (jpvalues && jpvalues.length) {
                    //chapterContent = jpvalues[0];
                    const html = jpvalues[0];
                    const dom = parseDocument(html);
                    chapterContent = render(dom, {
                        encodeEntities: 'utf8'
                    });
                }
                if (replace) {
                    chapterContent = textReplace(chapterContent, replace);
                }
            }
        }
        if (chapterContentType === 'html') {
            const dom = parseDocument(chapterHtml);
            if (chapters.chapter && chapters.chapter.title) {
                const { text, replace } = chapters.chapter.title;
                const elements = selectAll(text, dom);
                chapterTitle = elements.reduce((allText, el) => {
                    const elText = DomUtils.textContent(el);
                    if (elText) {
                        return allText ? allText + '\r\n' + elText : elText;
                    }
                    return allText;
                }, '');
                if (replace) {
                    chapterTitle = textReplace(chapterTitle, replace);
                }
            }
            if (chapters.chapter && chapters.chapter.content) {
                const { html, replace } = chapters.chapter.content;
                const elements = selectAll(html, dom);
                chapterContent = elements.reduce((allHtml, el) => {
                    const elHtml = render(el, {
                        encodeEntities: 'utf8'
                    });
                    if (elHtml) {
                        return allHtml ? allHtml + '\r\n' + elHtml : elHtml;
                    }
                    return allHtml;
                }, '');
                if (replace) {
                    chapterContent = textReplace(chapterContent, replace);
                }
            }
        }
        if (chapterTitle && chapterContent) {
            //chapterContent = fixContentText(chapterContent, chapterTitle);        
            const section = `
            <section>
                <title><p>${chapterTitle}</p></title>        
                <p></p>${chapterContent}
            </section>`;
            appendFileSync(`${bookDir}/${bookName}.fb2`, section);
        }
    }
    
    appendFileSync(`${bookDir}/${bookName}.fb2`, bookFooter);    

    console.log(`completed: ${bookDir}/${bookName}.fb2`);
}

const args = {}
for (let nArg = 2; nArg < process.argv.length; ) {  
    const arg = process.argv[nArg++];
    if (arg.slice(0, 2) === '--') {
        const longArg = arg.split('=');
        const longArgFlag = longArg[0].slice(2);        
        const longArgValue = longArg.length > 1 ? longArg[1] : (nArg < process.argv.length ? process.argv[nArg++] : '');
        args[longArgFlag] = longArgValue;
    }
    else if (arg[0] === '-') {
        const flags = arg.slice(1).split('');
        flags.forEach(flag => {
            args[flag] = true;
        });
    }
};

if (!args['project']) {
    console.log('Usage: node bookloader.js --project ./book-project.json');
    exit();
}

const bookProjectFile = args['project'];
const bookProject = JSON.parse(readFileSync(bookProjectFile));

if (!bookProject.book) {
    bookProject.book = {
        "author": "",
        "description": "",
        "genres": [],
        "title": "",
        "docId": 1
    };
}

await loadBookFb2(bookProject);