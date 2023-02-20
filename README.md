# book loader

## Install

Install dependencies by running the following command in the project's directory:

```bash
npm install
```

## Usage

```bash
node bookloader.js --project ./book-project.json
```

or

```bash
node bookloader.js --project=./book-project.json
```

## book-project.json

| Name | Type    | Description |
|------|:-------:|-------------|
| bookName | String | Name of the book |
| book | Object | [Book Details](#book-details) |
| baseURL | String | Base URL |
| chapterList | Object | [Chapter List](#chapter-list) |
| chapters | Object | [Chapters](#chapters) |
| debugFiddler | Boolean | Use fiddler proxy do debug |
| bookDir | String | Output directory |
| userAgent | String  | `User-Agent` HTTP header |
| loadDelay | Integer | Delay in milliseconds before loading next chapter |

## Book Details

| Name | Type | Description |
|------|:----:|-------------|
| author | String | Author of the book |
| description | String | Description (annotation) |
| genres | Array | Genres |
| title | String | Book title |
| docId | Number or String | fb2: `document-info/id` |

## Chapter List

| Name | Type | Description |
|------|:----:|-------------|
| URL | String | The URL of the downloading chapter list |
| accept | String | HTTP `Accept` header. Possible values: `application/json`, `text/html`. |
| post | Object | HTTP Post (see [example](#http-post-example) below) |
| book | Object | The rules to extract Book Details from [HTML](#extract-book-details-from-html) or [JSON](#extract-book-details-from-json) |

## HTTP Post Example

```json
"post": {
    "contentType": "application/x-www-form-urlencoded; charset=UTF-8",
    "body": "cat_id=13880&limit=3000&offset=0&query="
}
```

## Extract Book Details from HTML

```json
"book": {
    "author": {
        "text": "div.author-info"
    },
    "description": {
        "text": "div.description-info"
    },
    "genres": {
        "text": "div.genres-info"
    },
    "title": {
        "text": "div.book-container h1"
    }
}
```

## Extract Book Details from JSON

```json
"book": {
    "author": {
        "path": "$.pageProps.book.author"
    },
    "description": {
        "path": "$.pageProps.book.description"
    },
    "genres": {
        "path": "$.pageProps.book.genres[*].title"
    },
    "title": {
        "path":"$.pageProps.book.title"
    }
}
```

## Chapters

| Name | Type | Description |
|------|:----:|-------------|
| path | String | JSONPath - location of the chapter in the Chapter List JSON. Extracted value stored in `${chapter}` variable. |
| text| String | CSS Selector - location of the chapter in the Chapter List HTML. Extracted value stored in `${chapter}` variable. |
| URL | String | The URL of the downloading chapter. You can use `${chapter}` here. |
| chapter | Object | Chapter details: `title` and `content`. See examples of extracting chapter details from [HTML](#extract-chapter-details-from-html) and [JSON](#extract-chapter-details-from-json) below. |

## Extract Chapter Details from HTML

```json
"chapter": {
    "title": {
        "text": "article div.entry-content h2",
        "replace": [
            {
                "regex": "^[^—]*— ",
                "replace": ""
            },
            {
                "regex": " —.*$",
                "replace": ""
            }
        ]
    },
    "content": {
        "html": "article div.entry-content > p"
    }
}
```

## Extract Chapter Details from JSON

```json
"chapter": {
    "title": {
        "path": "$.pageProps.chapter.title"
    },
    "content": {
        "path": "$.pageProps.chapter.content.text"
    }
}
```

## Book Project Sample

```json
{
    "bookName": "my-load-book-name",
    "book": {
        "author": "",
        "description": "",
        "genres": [],
        "title": "",
        "docId": 1
    },
    "baseURL": "https://my-load-book-website/path",
    "chapterList": {
        "URL": "${baseURL}/${bookName}.json?book=${bookName}",
        "accept": "application/json",
        "book": {
            "author": {
                "path": "$.pageProps.book.author"
            },
            "description": {
                "path": "$.pageProps.book.description"
            },
            "genres": {
                "path": "$.pageProps.book.genres[*].title"
            },
            "title": {
                "path":"$.pageProps.book.title"
            }
        }
    },
    "chapters": {
        "path": "$.pageProps.book.chapters.*.url",
        "URL": "${baseURL}${chapter}.json",
        "accept": "application/json",
        "chapter": {
            "title": {
                "path": "$.pageProps.chapter.title"
            },
            "content": {
                "path": "$.pageProps.chapter.content.text"
            }
        }        
    },
    "debugFiddler": false,
    "bookDir": "./book",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
    "loadDelay": 500
}
```

## License

MIT