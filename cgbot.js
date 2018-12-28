/*eslint-env es6, node*/

"use strict";

// *****************************
// Requires

const xmpp = require('simple-xmpp'),
      config = require('./config.json'),
      fs = require('fs'),
      moment = require('moment'),
      _ = require('underscore'),
      Stanza = require('node-xmpp-client').Stanza,
      yargs = require('yargs'),
      util = require('util'),
      path = require('path'),
      crypto = require('crypto');

// *****************************
// Globals

const NICK = '__NICK__',
      START = '__START__',
      END = '__END__',
      FIND_NICK_REGEXP = new RegExp(config.nickname.toLowerCase(), 'gi'),
      CLEAN_MESSAGE_REGEXP = new RegExp('(' + ['[\\n\\g\\t]', NICK, START, END].join(')|(') + ')', 'gi'),
      REPLACE_NICK_REGEXP = new RegExp(NICK, 'gi'),
      MODE_NONE = 0,
      MODE_IGNORE_END = 1,
      MODE_FORCE_END = 2;

let bots = {};

// *****************************
// Functions and classes

let fsStat = util.promisify(fs.stat),
    fsMkdir = util.promisify(fs.mkdir),
    fsReaddir = util.promisify(fs.readdir),
    fsUnlink = util.promisify(fs.unlink),
    fsReadFile = util.promisify(fs.readFile),
    fsWriteFile = util.promisify(fs.writeFile);

let checkDirectory = async (dir) => {
    let stat;

    try {
        stat = await fsStat(dir);
    } catch {

    }

    if (!stat || !stat.isDirectory()) {
        console.log('Creating the directory', dir);

        await fsMkdir(dir);

        try {
            stat = await fsStat(dir);
        } catch (error) {

        }

        if (!stat || !stat.isDirectory()) {
            throw new Error('Unable to create the directory ' + dir);
        }
    }
};

let clearDirectory = async (dir) => {
    try {
        await Promise.all((await fsReaddir(dir)).map(file => fsUnlink(path.join(dir, file))));
    } catch {

    }
};

let cleanMessage = (message) => {
    return message.replace(CLEAN_MESSAGE_REGEXP, ' ').trim().replace(/\s\s+/g, ' ');
};

class DAO {
    constructor(dir) {
        this.dir = dir;
        this.queues = {};
        this.started = {};
    }

    async write(file, data) {
        await fsWriteFile(file, JSON.stringify(data));
    }

    async start(key) {
        let queue = this.queues[key],
            action = queue[0];

        if (!action) {
            if (queue.length) {
                queue.unshift();
            }

            if (queue.length) {
                this.start(key);
            } else {
                this.started[key] = false;
            }

            return;
        }

        let file = path.join(this.dir, action.dir, key),
            data;

        if (action.type === 'get') {
            try {
                data = JSON.parse((await fsReadFile(file)).toString('utf8'));
            } catch {
                data = {
                    words : action.value,
                    total: 0,
                    nexts: {}
                };

                await this.write(file, data);
            }

            action.resolve(data);
            queue.shift();
        } else if (action.type === 'set') {
            data = action.value;

            await this.write(file, data);

            action.resolve();
            queue.shift();
        }

        while (queue.length && queue[0].type === 'get') {
            queue[0].resolve(data);
            queue.shift();
        }

        if (queue.length) {
            this.start(key);
        } else {
            this.started[key] = false;
        }
    }

    queue(dir, key, type, value) {
        key = crypto.createHash('md5').update(dir + key).digest('hex');

        if (!this.queues[key]) {
            this.queues[key] = [];
        }

        let result = new Promise((resolve, reject) => {
            this.queues[key].push({
                dir: dir,
                type: type,
                value: value,
                resolve: resolve,
                reject: reject
            });
        });

        if (!this.started[key]) {
            this.started[key] = true;
            this.start(key);
        }

        return result;
    }

    async get(dir, key) {
        return await this.queue(dir, key, 'get', key);
    }

    set(dir, key, value) {
        return this.queue(dir, key, 'set', value);
    }
}

const dao = new DAO(config.data);

class Bot {
    constructor(conference) {
        this.conference = conference;
        this.index = {
            total: 0,
            starts: {}
        };
    }

    async add(from, to) {
        let data = await dao.get(this.conference, from);

        if (!data.nexts[to]) {
            data.nexts[to] = 0;
        }

        data.nexts[to] += 1;
        data.total += 1;

        if (from.startsWith(START)) {
            if (!this.index.starts[from]) {
                this.index.starts[from] = 0;
            }

            this.index.starts[from] += 1;
            this.index.total += 1;
        }

        dao.set(this.conference, from, data);
    }

    async learn(message) {
        message = message.replace(FIND_NICK_REGEXP, NICK).split(' ');

        if (message.length < config.power) {
            return;
        }

        let history = [START].concat(_.first(message, config.power));
        message = _.rest(message, config.power);

        for (const word of message) {
            this.add(history.join(' '), word);
            history.shift();
            history.push(word);
        }

        this.add(history.join(' '), END);
    }

    async randomNext(from, mode) {

    }

    async talk() {
        let output,
            counter = 0;

        do {
            let history = [],
                r = _.random(1, this.index.total);

            for (const key in this.index.starts) {
                r -= this.index.starts[key];

                if (r <= 0) {
                    output = key.split(' ');
                    history = key.split(' ');
                }
            }

            while (output.length < config.maximum.hard) {
                const next = await randomNext(history.join(' '), output.length < config.minimum.hard ? MODE_IGNORE_END : output.length < config.maximum.soft ? MODE_NONE : MODE_FORCE_END);

                if (next === END) {
                    break;
                }

                output.push(next);
                history.shift();
                history.push(next);
            }

            // TODO

        } while (output.length < (++counter <= 5 ? config.minimum.soft : config.minimum.hard));

        return output.join(' ');
    }

    async reindex() {
        const dir = path.join(config.data, this.conference);

        await Promise.all((await fsReaddir(dir)).map(async (file) => {
            let data = JSON.parse(await fsReadFile(path.join(dir, file)).toString('utf8'));

            if (data.words.startsWith(START)) {
                this.index.starts[data.words] = data.total;
                this.index.total += data.total;
            }
        }));
    }

    async reset() {
        await Promise.all((await fsReaddir(config.logs)).map(async (file) => {
            if (file.startsWith(this.conference) && path.extname(file) === '.log') {
                let content = await fsReadFile(path.join(config.logs, file));

                for (let line of content.toString('utf8').split('\n')) {
                    if (!line || line[0] !== '(' || line[9] !== ')') {
                        continue;
                    }

                    line = line.substring(11);

                    const index = line.indexOf(' : '),
                          from = line.substring(0, index).trim(),
                          message = cleanMessage(line.substring(index + 3));

                    if (!from || config.blacklist.includes(from)) {
                        continue;
                    }

                    if (message) {
                        this.learn(message);
                    }
                }
            }
        }));
    }
};

// *****************************
// Main

let main = async () => {
    config.blacklist.push(config.nickname);

    const argv = yargs

    .option('reset', {
        alias: 'r',
        default: false
    });

    const reset = argv.reset;

    config.conferences = config.groupchats.map(groupchat => ((groupchat + '@' + config.muc).toLowerCase()));

    await Promise.all([checkDirectory(config.data), checkDirectory(config.logs)].concat(config.conferences.map(conference => checkDirectory(path.join(config.data, conference)))));

    for (const conference of config.conferences) {
        bots[conference] = new Bot(conference);
    }

    if (reset) {
        console.log('Creating data');

        await clearDirectory(config.data);
        await Promise.all(config.conferences.map(conference => checkDirectory(path.join(config.data, conference))));

        await Promise.all(Object.values(bots).map(bot => bot.reset()));
    } else {
        await Promise.all(Object.values(bots).map(bot => bot.reindex()));
    }

    xmpp.on('groupchat', async (conference, from, message, stamp, delay) => {
        if (from.toLowerCase() == config.nickname.toLowerCase()) {
            // Private message
            return;
        }

        conference = conference.toLowerCase();

        message = cleanMessage(message);

        let now = moment();
        fs.appendFileSync(config.logs + '/' + conference.toLowerCase() + '-' + now.format('YYYY-MM-DD') + '.log', '(' + now.format('HH:mm:ss') + ') ' + from + ' : ' + message + '\n');

        if (config.blacklist.includes(from)) {
            return;
        }

        let bot = bots[conference];

        await bot.learn(message);

        if (FIND_NICK_REGEXP.test(message)) {
            let stanza = new Stanza('message', {
                to: conference,
                type: 'groupchat',
                id: config.nickname + new Date()
            });

            stanza.c('body').t((await bot.talk()).replace(REPLACE_NICK_REGEXP, from));

            xmpp.conn.send(stanza);
        }
    });

    xmpp.on('online', data => {
        for (const conference of config.conferences) {
            xmpp.join(conference + '/' + config.nickname);
        }
    });

    xmpp.on('error', error => {
        console.error('XMPP Error', error);
    });

    xmpp.on('close', () => {
        process.exit(0);
    });

    xmpp.connect({
        jid: config.jid,
        password: config.password,
        host: config.host,
        port: config.port
    });
};

main();