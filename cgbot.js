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
        if (file === 'words.json') {
            return;
        }

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
        say(conference, talk(words[conference]) || 'Magus: Error line 68');
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
        xmpp.conn.send(stanza);

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
    if (_.isArray(from)) {
        from = from.join(' ');
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

function clearLine(line) {
    return line.filter(function(word) {
        // Ignore empty words
        if (!word || !word.trim()) {
            return false;
        }

        // Ignore our own nickname
        if (word.toLowerCase().indexOf(config.nickname.toLowerCase()) !== -1) {
            return false;
        }

        // Ignore key words
        if (word.indexOf('__START__') !== -1 || word.indexOf('__END__') !== -1 || word.indexOf('__TOTAL__') !== -1) {
            return false;
        }

        return true;
    });
}

function addLine(conference, line) {
    line = clearLine(line);

    if (line.length < 2 || line.length < config.power) {
        return;
    }

    if (!words[conference]) {
        words[conference] = {};
    }

    if (config.power === 1) {
        addWord(words[conference], '__START__', line[0]);

        for (let i = 1; i < line.length; ++i) {
            addWord(words[conference], line[i - 1], line[i]);
        }

        addWord(words[conference], line[line.length - 1], '__END__');
    } else {
        let first = _.first(line, config.power - 1);

        addWord(words[conference], '__START__', first.join(' '));

        let history = ['__START__'].concat(first);

        for (let i = config.power - 1; i < line.length; ++i) {
            addWord(words[conference], history, line[i]);
            history.shift();
            history.push(line[i]);
        }

        addWord(words[conference], history, '__END__');
    }
}

function say(conference, message) {
    queue.push({
        conference: conference,
        message: message
    });
}

function randomNext(words, length) {
    if (!words) {
        return 'Magus EMPTY211';
    }

    let total = words.__TOTAL__ + 1;

    if (length < config.power + 2 && words.__END__) {
        total -= words.__END__;
    }

    if (total <= 1) {
        return 'Magus EMPTY232';
    }

    let random = getRandomInt(0, total);

    for (let key in words) {
        if (key !== '__TOTAL__' && !(length < config.power + 2 && key === '__END__')) {
            random -= words[key];

            if (random <= 0) {
                return key === '__END__' ? '' : key;
            }
        }
    }

    return 'Magus EMPTY246';
}

function talk(words) {
    if (!words) {
        return 'Magus: Error line 253';
    }

    let result = ['__START__'].concat(randomNext(words.__START__, 0).split(' '));

    if (!result || result.length <= 0) {
        return 'Magus: Error line 259';
    }

    while (result.length < 26) {
        let word = _.last(result, config.power).join(' ');

        if (!words[word] || (result.length > 21 && words[word].__END__)) {
            break;
        }

        let next = randomNext(words[word], result.length);

        if (next) {
            result.push(next);
        } else {
            break;
        }
    }

    // Remove __START__
    result.shift();

    if (result.length <= 0) {
        return 'Magus: Error line 283';
    }

    return result.join(' ');
}
