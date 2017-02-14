/*eslint-env es6, node*/

"use strict";

let xmpp = require('simple-xmpp'),
    config = require('./config.json'),
    fs = require('fs'),
    moment = require('moment'),
    _ = require('underscore'),
    Stanza = require('node-xmpp-client').Stanza;

checkDirectory('./data');

let words = {},
    resource = new Date().getTime();

xmpp.on('online', function(data) {
    config.groupchats.forEach(groupchat => xmpp.join(groupchat + '@' + config.muc + '/' + config.nickname));

    // Read log files for words and line
    fs.readdirSync('./data').forEach(file => {
        console.log('Reading log file', file);

        let conference = file.split('-')[0],
            content = fs.readFileSync('./data/' + file, 'utf-8');

        if (!words[conference]) {
            words[conference] = {
                __START__: {
                    __TOTAL__: 0
                }
            };
        }

        content.split('\n').forEach(line => {
            line = line.replace(/ +/g, ' ').split(' ');

            if (line.length < 2 || line[1].toLowerCase() === config.nickname.toLowerCase()) {
                return;
            }

            line = _.rest(line, 3);

            addLine(conference, line);
        });
    });

    fs.writeFileSync('./data/words.json', JSON.stringify(words, null, 4));
});

xmpp.on('error', function(error) {
    console.log('error', error);
});

xmpp.on('groupchat', function(conference, from, message, stamp, delay) {
    if (from.toLowerCase() === config.nickname.toLowerCase()) {
        return;
    }

    let now = moment();
    fs.appendFileSync('./data/' + conference.toLowerCase() + '-' + now.format('YYYY-MM-DD') + '.log', '(' + now.format('HH:mm:ss') + ') ' + from + ' : ' + message.replace(/\n\r/g, ' ') + '\n');

    if (message.toLowerCase().indexOf(config.nickname.toLowerCase()) !== -1) {
       say(conference, talk(words[conference]) || 'Nope');
    }

    addLine(conference, message.replace(/ +/g, ' ').split(' '));
});

/*xmpp.on('stanza', function(stanza) {
    console.log(JSON.stringify(stanza));
});*/

xmpp.connect({
    jid: config.jid,
    password: config.password,
    host: config.host,
    port: config.port
});

let queue = [];

setInterval(function() {
    if (queue.length) {
        let infos = queue[0];

        let stanza = new Stanza('message', {
            to: infos.conference,
            type: 'groupchat',
            id: config.nickname + (new Date().getTime())
        });
        stanza.c('body').t(infos.message);
        xmpp.conn.send(stanza)

        queue = _.rest(queue);
    }
}, 5000);

setInterval(function() {
    fs.writeFileSync('./data/words.json', JSON.stringify(words, null, 4));
}, 300000);

// *******************************************************

function checkDirectory(path) {
    let stat;

    try {
        stat = fs.statSync(path);
    } catch (error) {

    }

    if (!stat || !stat.isDirectory()) {
        console.log('Creating the directory', path);
        fs.mkdirSync(path);

        try {
            stat = fs.statSync(path);
        } catch (error) {

        }

        if (!stat || !stat.isDirectory()) {
            console.error('Unable to create the directory', path);
            process.exit(1);
        }
    }
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

function addWord(words, from, to) {
    if (!from || !to || from === '__TOTAL__' || to === '__TOTAL__' || from.toLowerCase().indexOf(config.nickname.toLowerCase()) !== -1 || to.toLowerCase().indexOf(config.nickname.toLowerCase()) !== -1) {
        return;
    }

    if (!words[from]) {
        words[from] = {
            __TOTAL__: 0
        };
    }

    words[from][to] = words[from][to] || 0;
    words[from][to] += 1;
    words[from].__TOTAL__ += 1;
}

function addLine(conference, line) {
    if (line.length < 2) {
        return;
    }

    if (!words[conference]) {
        words[conference] = {};
    }

    addWord(words[conference], '__START__', line[0]);

    for (let i = 0; i < line.length; ++i) {
        addWord(words[conference], line[i - 1], line[i]);
    }

    addWord(words[conference], line[line.length - 1], '__END__');
}

function say(conference, message) {
    queue.push({
        conference: conference,
        message: message
    });
}

function talk(words) {
    let result = [],
        word = '__START__';

    if (!words) {
        return '';
    }

    while (word !== '__END__' && result.length < 25) {
        if (!words[word] || (result.length > 20 && words[word].__END__)) {
            break;
        }

        let total = words[word].__TOTAL__ + 1;

        if (result.length < 2 && words[word].__END__) {
            total -= words[word].__END__;
        }

        if (total <= 1) {
            break;
        }

        let random = getRandomInt(0, total);

        for (let key in words[word]) {
            if (key !== '__TOTAL__' && !(result.length < 2 && key === '__END__')) {
                random -= words[word][key];

                if (random <= 0) {
                    if (key !== '__END__') {
                        result.push(key);
                    }

                    word = key;

                    break;
                }
            }
        }
    }

    if (result.length <= 0) {
        return 'Nope';
    }

    return result.join(' ');
}