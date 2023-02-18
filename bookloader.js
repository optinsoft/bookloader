import HttpsProxyAgent from 'https-proxy-agent';
import fetch from 'node-fetch';
import {writeFileSync, appendFileSync, existsSync, readFileSync, mkdirSync} from 'fs';
import { exit } from 'process';

async function loadData(url, debugFiddler) {
    let fetchInit = {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
        }
    }
    if (debugFiddler) {
        const proxyAgent = new HttpsProxyAgent('http://127.0.0.1:8888')
        fetchInit.agent = proxyAgent;
    }
    const response = await fetch(url, fetchInit);
    const responseJson = await response.json();
    //console.log(responseJson);
    return responseJson;    
}

async function loadBookFb2(bookName, baseURL, debugFiddler, bookDir) {
    const bookURL = new URL(`${baseURL}/${bookName}.json?book=${bookName}`);
    const bookJson = await loadData(bookURL.toString(), debugFiddler);
    
    writeFileSync(`${bookDir}/json/${bookName}.json`, JSON.stringify(bookJson));
    
    const {author, description, genres, title, chapters} = bookJson.pageProps.book;
    
    const genresXMLItems = genres.reduce((items, {title}) => items + `\r\n        <genre>${title}</genre>`, '');
    
    const docAuthor = '';
    const docDate = new Date().toISOString().split('T')[0]
    const docId = 176;
    
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
    
    function fixContentText(text, chapterName) {
        const fixArray = [
            {search: /ё&/i, replace:'ё'},
            {search: /&ё/i, replace:'ё'},
            {search: /&\./i, replace:'ё.'},
            {search: /&,/i, replace:'ё,'},
            {search: /\s?&м/i, replace:'ём'},
            {search: / & /i, replace:'ё '},
        ]
        fixArray.forEach(({search, replace}) => {
            text = text.replace(search, substr => {
                console.log(`fix chapter "${chapterName}" "${substr}" -> "${replace}"`);
                return replace;
            });
        });
        return text;
    }
    
    for(const {title, url} of chapters.reverse()) {
        const u = new URL(`${baseURL}${url}`);
        let chapterName = u.pathname.substring(u.pathname.lastIndexOf('/')+1);
        let chapterUrl = u.toString();
        if (chapterName.endsWith('.json')) {
            chapterName = chapterName.slice(0, -5);
        }
        else {
            chapterUrl += '.json';
        }
        //console.log(chapterName);
        let chapterJson = '';
        const chaptersDir = `${bookDir}/json/${bookName}`;
        if (!existsSync(chaptersDir)) {
            mkdirSync(chaptersDir);
        }
        const chapterFilename = `${chaptersDir}/${chapterName}.json`;        
        if (!existsSync(chapterFilename)) {
            // console.log(chapterFilename, 'NOT FOUND');
            console.log(`loading chapter from ${chapterUrl}`);
            await sleep(500);        
            chapterJson = await loadData(chapterUrl, debugFiddler);
            writeFileSync(chapterFilename, JSON.stringify(chapterJson));        
        }
        else {
            chapterJson = JSON.parse(readFileSync(chapterFilename));
        }
        const {title, content} = chapterJson.pageProps.chapter;
        const text = fixContentText(content.text, title);
    
        const section = `
        <section>
            <title><p>${title}</p></title>        
            <p></p>${text}
        </section>`;
        appendFileSync(`${bookDir}/${bookName}.fb2`, section);
    
    }
    
    appendFileSync(`${bookDir}/${bookName}.fb2`, bookFooter);    
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

const { bookName, baseURL, debugFiddler, bookDir } = bookProject;

if (debugFiddler) {
    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
}

await loadBookFb2(bookName, baseURL, debugFiddler, bookDir);