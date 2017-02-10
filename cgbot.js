/*eslint-env es6, node*/

"use strict";

var xmpp = require('simple-xmpp'),
    config = require('./config.json'),
    fs = require('fs');

checkDirectory('data');

xmpp.on('online', function(data) {
    config.groupchats.forEach(groupchat => xmpp.join(groupchat + '@' + config.muc + '/' + config.nickname));
});

xmpp.on('error', function(error) {
    console.log('error', error);
});

xmpp.on('groupchat', function(conference, from, message, stamp) {

});

xmpp.connect({
    jid: config.jid,
    password: config.password,
    host: config.host,
    port: config.port
});

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