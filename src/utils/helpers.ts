import c from 'chalk'
import {SingleBar, Presets} from 'cli-progress'
import * as fs from 'fs'
import * as readline from 'readline'
import {once} from 'events'
import {Wallet, isAddress} from 'ethers'
import {retryCount} from '../../config'

const log = console.log
const DEV = false

async function sleep(sec: number) {
    if (sec > 1) {
        sec = Math.round(sec)
    }
    let bar = new SingleBar(
        {
            format: `${c.yellowBright('{bar}')} | ${c.yellowBright.italic('{value}/{total} sec')}`,
            barsize: 80
        },
        Presets.legacy
    )
    bar.start(sec, 0)
    for (let i = 0; i < sec; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1 * 1000))
        bar.increment()
    }
    bar.stop()
    process.stdout.clearLine(0)
}
async function defaultSleep(sec: number, needProgress = true) {
    if (needProgress) {
        let newpaste = ['-', `\\`, `|`, `/`]
        for (let i = 0; i < sec * 2; i++) {
            process.stdout.clearLine(0) // clear current text
            process.stdout.cursorTo(0)
            process.stdout.write(`${newpaste[i % 4]}`)
            await new Promise((resolve) => setTimeout(resolve, 500))
        }
        process.stdout.clearLine(0) // clear current text
        process.stdout.cursorTo(0)
        return
    }
    return await new Promise((resolve) => setTimeout(resolve, sec * 1000))
}

const retry = async (fn: any, {maxRetries = retryCount ?? 5, retryInterval = 10, backoff = 1, needLog = true}, ...args: any): Promise<any> => {
    retryInterval = retryInterval * backoff
    let i = 1
    let lastError
    while (i <= maxRetries) {
        try {
            return await fn(...args)
        } catch (e: any) {
            lastError = e
            if (DEV) {
                console.log(e)
            }
            if (needLog) {
                console.log(e?.message)
                console.log(`catched error, retrying... [${i}]`)
            }
            // console.log(c.magenta('if you see this, please contact the author and tell about error above'))
            await defaultSleep(retryInterval, false)
        }
        i++
    }
    throw lastError ?? new Error(`Could not execute ${fn.name} in ${maxRetries} tries`)
}

class Random {
    getRandomNumber(tier: {from: number; to: number}, precision = 6): number {
        return Number((Math.random() * (tier.to - tier.from) + tier.from).toFixed(precision))
    }
    getRandomBigInt(tier: {from: bigint; to: bigint}) {
        const delta = tier.to - tier.from
        const randValue = BigInt((Math.random() * 1000).toFixed(0))
        return tier.from + (randValue * delta) / 1000n
    }
    getRandomElementFromArray(arr: any[]) {
        return arr[Math.floor(Math.random() * arr.length)]
    }
    shuffleArray<T>(oldArray: T[]): T[] {
        let array = oldArray.slice()
        let buf
        for (let i = 0; i < array.length; i++) {
            buf = array[i]
            let randNum = Math.floor(Math.random() * array.length)
            array[i] = array[randNum]
            array[randNum] = buf
        }
        return array
    }
}

async function importPrivateData(path: string) {
    let data: string[] = []
    let instream = fs.createReadStream(path)
    let rl = readline.createInterface(instream)
    rl.on('line', (line) => {
        data.push(line)
    })
    await once(rl, 'close')
    return data
}
async function importAndValidatePrivates(path: string) {
    let intialData = await importPrivateData(path)
    let privates: string[] = []
    for (let i = 0; i < intialData.length; i++) {
        try {
            let signer = new Wallet(intialData[i])
        } catch (e: any) {
            console.log(c.red(`INVALID private key #${i + 1}: ${intialData[i]}`))
            throw new Error(`INVALID private key #${i + 1}: ${intialData[i]}`)
        }
        privates.push(intialData[i])
    }
    return privates
}
async function importAndValidateProxies(path: string) {
    let intialData = await importPrivateData(path)
    let proxies: string[] = []
    for (let i = 0; i < intialData.length; i++) {
        if (intialData[i].includes('login:pass@ip:port')) {
            console.log(c.red(`remove example proxy from list: login:pass@ip:port`))
            throw new Error(`remove example proxy from list: login:pass@ip:port`)
        }
        proxies.push(intialData[i])
    }
    return proxies
}
function appendToFile(file: string, data: string) {
    fs.appendFileSync(`${file}`, data + '\n')
}
function writeToFile(file: string, data: string) {
    fs.writeFileSync(`${file}`, data + '\n')
}

const RandomHelpers = new Random()

export {
    c,
    log,
    sleep,
    defaultSleep,
    retry,
    RandomHelpers,
    importPrivateData,
    importAndValidatePrivates,
    importAndValidateProxies,
    appendToFile,
    writeToFile
}
