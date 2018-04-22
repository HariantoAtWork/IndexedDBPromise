const IndexedDBPromise = function (databaseName, options) {
    var indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB,
        IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.msIDBTransaction || { READ_WRITE: "readwrite" }, // This line should only be needed if it is needed to support the object's constants for older browsers
        IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange,
        DB = {}

    const log = () => {
        if (options && options.hasOwnProperty('debug') && options.debug) {
            console.log.apply(console, arguments)
        }
    }

    const error = () => {
        if (options && options.hasOwnProperty('debug') && options.debug) {
            console.error.apply(console, arguments)
        }
    }

    const openDB = databaseName => new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName)
        log('openDB:', databaseName)
        request.onsuccess = event => {
            const db = event.target.result
            resolve({ db })
        }
        request.onerror = reject
        request.onclose = log.bind(console, `${databaseName} closed:`)
    })

    const upgradeDatabaseOnNewObjectStore = (tableName, { db }) => new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(tableName)) {
            log('upgradeDatabaseOnNewObjectStore', `'${tableName}'`, 'creating')
            const version = +db.version
            const databaseName = db.name
            db.close()
            const nextRequest = indexedDB.open(databaseName, version + 1)
            nextRequest.onupgradeneeded = nextEvent => {
                const database = nextEvent.target.result
                database.createObjectStore(tableName, { keyPath: 'id', autoIncrement: true })
            }
            nextRequest.onsuccess = nextEvent => {
                log('upgradeDatabaseOnNewObjectStore', `'${tableName}'`, 'onsuccess')
                const db = nextEvent.target.result
                resolve({ db, tableName })
            }
            nextRequest.onerror = error.bind(console, 'upgradeDatabaseOnNewObjectStore')
        } else {
            log('upgradeDatabaseOnNewObjectStore', `'${tableName}'`, 'already exist')
            resolve({ db, tableName })
        }
    })

    const openTransaction = (mode, { tableName, db }) => new Promise((resolve, reject) => {
        log({ mode, tableName, db })
        const tx = db.transaction(db.objectStoreNames, mode)
        const store = tx.objectStore(tableName)
        resolve({ store, tx, db })
        tx.oncomplete = log.bind(console, 'tx: oncomplete', tableName)
        tx.onerror = log.error(console, 'tx: onerror', tableName)
    })

    const putDataToStore = ({ store, data }) => new Promise((resolve, reject) => {
        const request = store.put(data)
        request.onsuccess = (event) => resolve(event.target.result)
        request.onerror = (error) => reject(error)
    })

    const put = (data, { store, tx, db }) => new Promise((resolve, reject) => {
        log({ data, store, tx })
        if (Array.isArray(data)) {
            const promises = []
            data.forEach(item => {
                promises.push(putDataToStore({ store, data: item }))
            })
            tx.onsuccess = log.bind(console, 'put Array')
            resolve(
                Promise.all(promises)
                    .then(result => { db.close(); return result })
            )
                
            
        } else if (data && !Array.isArray(data) && typeof data === 'object') {
            tx.onsuccess = log.bind(console, 'put Object')
            resolve(
                putDataToStore({ store, data })
                .then(result => { db.close(); return result })
            )
        } else {
            reject('put: No empty data! <string, number, array>')
        }
    })

    const getDataFromStoreById = ({ store, id }) => new Promise((resolve, reject) => {
        const request = store.get(id)
        request.onsuccess = (event) => resolve(event.target.result)
        request.onerror = (error) => reject(error)
    })

    const get = (id, { store, tx, db }) => new Promise((resolve, reject) => {
        if (Array.isArray(id)) {
            const promises = []
            id.forEach(item => {
                promises.push(getDataFromStoreById({ store, id: item }))
            })
            tx.onsuccess = log.bind(console, 'get Array')
            resolve(
                Promise.all(promises)
                .then(result => { db.close(); return result })
            )
        } else if (id && !Array.isArray(id) && typeof id === 'object') {
            reject('get: No object data! <string, number, array>')
        } else {
            tx.onsuccess = log.bind(console, 'get Object')
            resolve(
                getDataFromStoreById({ store, id })
                .then(result => { db.close(); return result })
            )
        }
    })

    const getAll = ({ query, count }, { store, tx, db }) => new Promise((resolve, reject) => {
        let result
        if (count) {
            log({ count })
            result = store.getAll(query, count)
        } else if (query) {
            log({ query })
            result = store.getAll(query)
        } else {
            result = store.getAll()
        }
        result.onsuccess = (event) => { db.close(); resolve(event.target.result)}
        result.onerror = (error) => { db.close(); reject(error) }
    })

    const deleteDatabase = databaseName => new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(databaseName)
        request.onerror = reject
        request.onsuccess = event => {
            log(`${databaseName} is deleted successfully`)
            resolve(event.result)
        }
    })

    const readonlyTransaction = (databaseName, tableName) => openDB(databaseName)
        .then(upgradeDatabaseOnNewObjectStore.bind(upgradeDatabaseOnNewObjectStore, tableName))
        .then(openTransaction.bind(openTransaction, 'readonly'))

    const readwriteTransaction = (databaseName, tableName) => openDB(databaseName)
        .then(upgradeDatabaseOnNewObjectStore.bind(upgradeDatabaseOnNewObjectStore, tableName))
        .then(upgradeDatabaseOnNewObjectStore.bind(upgradeDatabaseOnNewObjectStore, tableName)) // this works, but need to refactor
        .then(openTransaction.bind(openTransaction, 'readwrite'))

    this.CRUD = function (tableName) {
        const tx = readwriteTransaction(databaseName, tableName)
        this.put = data => tx.then(put.bind(put, data))
        this.get = id => tx.then(get.bind(get, id))
        this.getAll = () => tx.then(getAll.bind(getAll, {}))
    }

}


// Example
const data0 = [
    { title: 'Quarry Memories', author: 'Fred', isbn: 123456 },
    { title: 'Stuff is edited', author: 'Harianto', isbn: 345678 },
    { title: 'All your base are belong to us', author: 'Fred', isbn: 234567 }
]
const data1 = [
    { title: 'Another', author: 'Fred', isbn: 123456 },
    { title: 'Something great', author: 'Harianto', isbn: 345678 },
    { title: 'IndexedD I hate it', author: 'Fred', isbn: 234567 }
]
const data2 = [
    { title: 'AAA', author: 'AAA-AAA', isbn: 123456 },
    { title: 'BBB', author: 'BBB-BBB', isbn: 345678 },
    { title: 'CCC', author: 'CCC-CCC', isbn: 234567 }
]
const DB = new IndexedDBPromise('somethingDb')

const users = new DB.CRUD('users')
const books = new DB.CRUD('books')


users.put(data0).then(console.log.bind(console, 'PUT'))
users.put(data1).then(console.log.bind(console, 'PUT'))
books.put(data2).then(console.log.bind(console, 'PUT'))


books.getAll().then(console.log.bind(console))
users.getAll().then(console.log.bind(console))
books.get(2).then(console.log.bind(console))