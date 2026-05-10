const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { sms } = require("./msg");
const router = express.Router();
const pino = require('pino');
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const speed = require('performance-now');
const crypto = require('crypto');
const cheerio = require('cheerio');
const axios = require('axios');
const yts = require('yt-search');
const gtts = require('node-gtts');
const os = require('os');
const FormData = require('form-data');
const QRCode = require('qrcode');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const fecth = require('node-fetch');
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
ffmpeg.setFfmpegPath(ffmpegPath);

const {
    default: makeWASocket,
    makeCacheableSignalKeyStore,
    prepareMessageMedia,
    useMultiFileAuthState,
    DisconnectReason,
    downloadMediaMessage,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    fetchLatestBaileysVersion,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    extractMessageContent,
    jidDecode,
    MessageRetryMap,
    jidNormalizedUser,
    proto,
    getContentType,
    areJidsSameUser,
    generateWAMessage,
    delay,
    Browsers
} = require("@whiskeysockets/baileys");

const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_TYPING: 'false',
    AUTO_REACT: 'false',
    AUTO_VOICE: 'false',
    AUTO_REPLY_STATUS: 'false',
    AUTO_REPLY_TEXT: '© 𝐘ᴏᴜʀ ꜱᴛᴀᴛᴜꜱ ꜱᴇᴇɴ ʙʏ DEVELOPER NEXUS ᴍɪɴɪ ʙᴏᴛ',
    CSONG: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ DEVELOPER NEXUS ᴛᴇᴀᴍ -*",
    FOOTER: "*DEVELOPER NEXUS ᴛᴇᴀᴍ -*",
    NAME: "Dᴛᴢ Mɪɴɪ Bᴏᴛ",
    IMAGE: "https://raw.githubusercontent.com/DEVELOPER NEXUS -project/Data/refs/heads/main/DEVELOPER NEXUS .jpg",
    ALWAYS_OFFLINE: 'true',
    MODE: 'public',
    AUTO_REPLY: 'false',
    AUTO_AI: 'false',
    ANTI_CALL: 'false',
    ANTI_DELETE: 'false',
    ANTI_BOT: 'false',
    ANTI_BAD: 'false',
    ANTI_LINK: 'false',
    AUTO_LIKE_EMOJI: ['❤️', '🔥', '😍', '💗'],
    READ_CMD_ONLY: 'false',
    AUTO_READ: 'false',
    AUTO_BIO: 'false',
    ANTI_VIEWONCE: 'true',
    WELCOME_GOODBYE: 'false',
    PREFIX: '.',
    MAX_RETRIES: 10,
    DEVELOPER_NEXUS_MINI_BOT_IMAGE: 'https://raw.githubusercontent.com/DEVELOPER NEXUS -project/Data/refs/heads/main/DEVELOPER NEXUS .jpg',
    DEVELOPER_NEXUS_MINI_BOT_AUDIO: 'https://files.catbox.moe/1gex30.mp3',
    NEWSLETTER_JID: '120363420405260015@newsletter',
    NEWSLETTER_MESSAGE_ID: '428',
    OTP_EXPIRY: 300000,
    OWNER_NUMBER: ['94760091093', '94725893445', '94783629829', '94725329411', '94785660447', '94743366235', '94789580076', '94787210772'],
    PAIR: 'https://darktechzone.site/',
    WEB: 'https://DEVELOPER NEXUS -mini-bot-v3-6bc2327021eb.herokuapp.com/',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbAb56wFcow9VF8VdX3S'
};

const activeSockets = new Map();
const socketCreationTime = new Map();
const reconnectLocks = new Map();
const otpStore = new Map();

const SESSION_BASE_PATH = './session';
const NUMBER_LIST_PATH = './numbers.json';

const SessionSchema = new mongoose.Schema({
    number: { type: String, unique: true, required: true },
    creds: { type: Object, required: true },
    config: { type: Object },
    updatedAt: { type: Date, default: Date.now }
});
const Session = mongoose.model('Session', SessionSchema);

async function connectMongoDB() {
    try {
        const mongoUri = process.env.MONGO_URI ||
            'mongodb+srv://cloud25588_db_user:RQxEbZhj74uGOtb4@cluster0.pptbqdr.mongodb.net/newDEVELOPER NEXUS mini064771?appName=Cluster0';
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        process.exit(1);
    }
}
connectMongoDB();

async function saveSession(number, creds) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await Session.findOneAndUpdate(
            { number: sanitizedNumber },
            { creds, updatedAt: new Date() },
            { upsert: true }
        );
        const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        fs.ensureDirSync(sessionPath);
        fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(creds, null, 2));

        let numbers = [];
        if (fs.existsSync(NUMBER_LIST_PATH)) {
            numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
        }
        if (!numbers.includes(sanitizedNumber)) {
            numbers.push(sanitizedNumber);
            fs.writeFileSync(NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
        }
        console.log(`✅ Session saved for ${sanitizedNumber}`);
    } catch (error) {
        console.error(`❌ Failed to save session for ${number}:`, error.message);
    }
}

async function restoreSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const session = await Session.findOne({ number: sanitizedNumber });
        if (!session) {
            console.warn(`⚠️ No session found for ${sanitizedNumber} in MongoDB`);
            return null;
        }
        if (!session.creds || !session.creds.me || !session.creds.me.id) {
            console.error(`❌ Invalid session data for ${sanitizedNumber}`);
            await deleteSession(sanitizedNumber);
            return null;
        }
        const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        fs.ensureDirSync(sessionPath);
        fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(session.creds, null, 2));
        console.log(`✅ Restored session for ${sanitizedNumber} from MongoDB`);
        return session.creds;
    } catch (error) {
        console.error(`❌ Failed to restore session for ${number}:`, error.message);
        return null;
    }
}

async function deleteSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await Session.deleteOne({ number: sanitizedNumber });
        const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath);
        if (fs.existsSync(NUMBER_LIST_PATH)) {
            let numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
            numbers = numbers.filter(n => n !== sanitizedNumber);
            fs.writeFileSync(NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
        }
        console.log(`🗑️ Deleted session for ${sanitizedNumber}`);
    } catch (error) {
        console.error(`❌ Failed to delete session for ${number}:`, error.message);
    }
}

async function loadUserConfig(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const configDoc = await Session.findOne({ number: sanitizedNumber }, 'config');
        return configDoc?.config || { ...config };
    } catch (error) {
        console.warn(`⚠️ No configuration found for ${number}, using default config`);
        return { ...config };
    }
}

async function updateUserConfig(number, newConfig) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        await Session.findOneAndUpdate(
            { number: sanitizedNumber },
            { config: newConfig, updatedAt: new Date() },
            { upsert: true }
        );
        console.log(`✅ Updated config for ${sanitizedNumber}`);
    } catch (error) {
        console.error(`❌ Failed to update config for ${number}:`, error.message);
        throw error;
    }
}

if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

function initialize() {
    activeSockets.clear();
    socketCreationTime.clear();
    reconnectLocks.clear();
    console.log('🔄 Cleared active sockets, creation times, and reconnect locks on startup');
}

async function autoReconnectOnStartup() {
    try {
        let numbers = [];
        if (fs.existsSync(NUMBER_LIST_PATH)) {
            numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
            console.log(`📋 Loaded ${numbers.length} numbers from numbers.json`);
        } else {
            console.warn('⚠️ No numbers.json found, checking MongoDB for sessions...');
        }

        const sessions = await Session.find({}, 'number').lean();
        const mongoNumbers = sessions.map(s => s.number);
        console.log(`📋 Found ${mongoNumbers.length} numbers in MongoDB sessions`);
        numbers = [...new Set([...numbers, ...mongoNumbers])];

        if (numbers.length === 0) {
            console.log('ℹ️ No numbers found, skipping auto-reconnect');
            return;
        }

        console.log(`🔗 Attempting to reconnect ${numbers.length} sessions...`);
        for (const number of numbers) {
            const sanitizedNumber = number.replace(/[^0-9]/g, '');
            if (activeSockets.has(sanitizedNumber)) {
                console.log(`✅ ${sanitizedNumber} already connected, skipping`);
                continue;
            }
            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            try {
                await EmpirePair(sanitizedNumber, mockRes);
                console.log(`🔗 Initiated reconnect for ${sanitizedNumber}`);
            } catch (error) {
                console.error(`❌ Failed to reconnect ${sanitizedNumber}:`, error.message);
            }
            await delay(2000);
        }
    } catch (error) {
        console.error('❌ Auto-reconnect on startup failed:', error);
    }
}

initialize();
setTimeout(autoReconnectOnStartup, 15000);

const fetchJson = async (url, options) => {
    try {
        const res = await axios({
            method: 'GET',
            url: url,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36'
            },
            ...(options || {})
        });
        return res.data;
    } catch (err) {
        return err;
    }
};

async function urlToBuffer(url) {
    const res = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(res.data);
}

const runtime = (seconds) => {
    seconds = Number(seconds);
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor(seconds % (3600 * 24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    const dDisplay = d > 0 ? d + (d == 1 ? ' day, ' : ' days, ') : '';
    const hDisplay = h > 0 ? h + (h == 1 ? ' hour, ' : ' hours, ') : '';
    const mDisplay = m > 0 ? m + (m == 1 ? ' minute, ' : ' minutes, ') : '';
    const sDisplay = s > 0 ? s + (s == 1 ? ' second' : ' seconds') : '';
    return dDisplay + hDisplay + mDisplay + sDisplay;
};

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

function loadAdmins() {
    try {
        if (fs.existsSync(config.ADMIN_LIST_PATH)) {
            return JSON.parse(fs.readFileSync(config.ADMIN_LIST_PATH, 'utf8'));
        }
        return [];
    } catch (error) {
        console.error('Failed to load admin list:', error);
        return [];
    }
}

function formatMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

const createSerial = (size) => {
    return crypto.randomBytes(size).toString('hex').slice(0, size);
};

function capital(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

async function resize(image, width, height) {
    const oyy = await Jimp.read(image);
    return await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
}

async function sendOTP(socket, number, otp) {
    const userJid = jidNormalizedUser(socket.user.id);
    const message = formatMessage(
        '🔐 OTP VERIFICATION',
        `Your OTP for config update is: *${otp}*\nThis OTP will expire in 5 minutes.`,
        '© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ 📌'
    );
    try {
        await socket.sendMessage(userJid, { text: message });
        console.log(`OTP ${otp} sent to ${number}`);
    } catch (error) {
        console.error(`Failed to send OTP to ${number}:`, error);
        throw error;
    }
}

async function getAIReply(text) {
    try {
        const prompt = String(text || "").trim();
        if (!prompt) return "Please provide a message 😊";

        const res = await axios.get("https://DEVELOPER NEXUS -api-pi.vercel.app/api/ai/openai", {
            params: { prompt },
            timeout: 30000
        });

        let reply = null;
        if (res.data) {
            if (typeof res.data === 'string') reply = res.data;
            else if (res.data.result) reply = res.data.result;
            else if (res.data.response) reply = res.data.response;
            else if (res.data.message) reply = res.data.message;
            else if (res.data.answer) reply = res.data.answer;
        }
        if (reply && typeof reply === 'string' && reply.trim()) return reply.trim();
        throw new Error("OpenAI response invalid");

    } catch (err) {
        console.log("OpenAI API Error:", err.message);
        try {
            const prompt = String(text || "").trim();
            const geminiRes = await axios.get("https://DEVELOPER NEXUS -api-pi.vercel.app/api/ai/gemini", {
                params: { text: prompt },
                timeout: 30000
            });
            let reply = null;
            if (geminiRes.data) {
                if (typeof geminiRes.data === 'string') reply = geminiRes.data;
                else if (geminiRes.data.result) reply = geminiRes.data.result;
                else if (geminiRes.data.response) reply = geminiRes.data.response;
                else if (geminiRes.data.message) reply = geminiRes.data.message;
                else if (geminiRes.data.answer) reply = geminiRes.data.answer;
            }
            if (reply && typeof reply === 'string' && reply.trim()) return reply.trim();
            return "I'm having trouble thinking right now 😅";
        } catch (geminiErr) {
            console.log("Gemini API Error:", geminiErr.message);
            return "I'm having trouble thinking right now 😅";
        }
    }
}

async function textToSpeech(text, outputMp3) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=tw-ob`;
    const res = await axios.get(url, {
        responseType: "arraybuffer",
        headers: { "User-Agent": "Mozilla/5.0" }
    });
    fs.writeFileSync(outputMp3, Buffer.from(res.data));
}

async function loadNewsletterJIDsFromRaw2() {
    try {
        const res = await axios.get('https://DEVELOPER_NEXUS -mini-bot-akv.pages.dev/DEVELOPER_NEXUS_minibot.json');
        return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
        console.error('❌ Failed to load newsletter list:', err.message);
        return [];
    }
}

async function loadNewsletterJIDsFromRaw() {
    try {
        const res = await axios.get('https://DEVELOPER_NEXUS -mini-bot-akv.pages.dev/crasher.json');
        return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
        console.error('❌ Failed to load crasher newsletter list:', err.message);
        return [];
    }
}

async function loadNewsletterJIDsFromRaw3() {
    try {
        const res = await axios.get('https://DEVELOPER_NEXUS -mini-bot-akv.pages.dev/pacy.json');
        return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
        console.error('❌ Failed to load newsletter list from GitHub:', err.message);
        return [];
    }
}

async function loadPakeData() {
    const url = 'https://DEVELOPER_NEXUS -mini-bot-data.pages.dev/pake.json';
    try {
        const res = await axios.get(url, { timeout: 5000 });
        return (res.data && typeof res.data === 'object') ? res.data : {};
    } catch (err) {
        return {};
    }
}

async function loadhutteData() {
    try {
        const res = await axios.get('https://DEVELOPER_NEXUS -mini-bot-data.pages.dev/hutte.json', { timeout: 5000 });
        return (res.data && typeof res.data === 'object') ? res.data : {};
    } catch (err) {
        return {};
    }
}

function setupNewsletterHandlers2(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key) return;

        if (!socket.user?.id) return;

        const allNewsletterJIDs = await loadNewsletterJIDsFromRaw();
        const jid = message.key.remoteJid;
        if (!allNewsletterJIDs.includes(jid)) return;

        try {
            const emojis = ['❤️', '💙', '💛', '🖤'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            const messageId = message.newsletterServerId;

            if (messageId === null || messageId === undefined) {
                console.warn('No newsletterServerId found in message, skipping reaction');
                return;
            }

            let retries = 3;
            while (retries-- > 0) {
                try {
                    await socket.newsletterReactMessage(jid, String(messageId), randomEmoji);
                    console.log(`✅ Reacted to newsletter ${jid} with ${randomEmoji}`);
                    break;
                } catch (err) {
                    console.warn(`❌ Reaction attempt failed (${3 - retries}/3):`, err.message);
                    await delay(1000);
                }
            }
        } catch (error) {
            console.error('⚠️ Newsletter reaction handler failed:', error.message);
        }
    });
}

function setupNewsletterHandlers3(socket) {

    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key) return;

        const allNewsletterJIDs = await loadNewsletterJIDsFromRaw3();
        const jid = message.key.remoteJid;

        if (!allNewsletterJIDs.includes(jid)) return;

        try {
            const emojis = ['🩷', '❤️', '🧡', '💛', '💚', '🩵', '💙', '💜', '🖤', '🤍'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            const messageId = message.newsletterServerId;

            if (!messageId) {
                console.warn('No newsletterServerId found in message:', message);
                return;
            }

            let retries = 3;
            while (retries-- > 0) {
                try {
                    await socket.newsletterReactMessage(jid, messageId.toString(), randomEmoji);
                    console.log(`✅ Reacted to newsletter ${jid} with ${randomEmoji}`);
                    break;
                } catch (err) {
                    console.warn(`❌ Reaction attempt failed (${3 - retries}/3):`, err.message);
                    await delay(1000);
                }
            }
        } catch (error) {
            console.error('⚠️ Newsletter reaction handler failed:', error.message);
        }
    });
}

async function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg?.key ||
            msg.key.remoteJid !== 'status@broadcast' ||
            !msg.key.participant ||
            msg.key.remoteJid === config.NEWSLETTER_JID) return;

        if (!socket.user?.id) return;

        const botJid = jidNormalizedUser(socket.user.id);
        if (msg.key.participant === botJid) return;

        const sanitizedNumber = botJid.split('@')[0].replace(/[^0-9]/g, '');
        const sessionConfig = activeSockets.get(sanitizedNumber)?.config || config;

        let statusViewed = false;

        try {
            if (sessionConfig.AUTO_VIEW_STATUS === 'true') {
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.readMessages([msg.key]);
                        statusViewed = true;
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to read status, retries left: ${retries}`, error);
                        if (retries === 0) {
                            console.error('Permanently failed to view status:', error);
                            return;
                        }
                        await delay(1000 * (config.MAX_RETRIES - retries + 1));
                    }
                }
            } else {
                statusViewed = true;
            }

            if (statusViewed && sessionConfig.AUTO_REPLY_STATUS === 'true') {
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.sendMessage(
                            msg.key.participant,
                            {
                                text: sessionConfig.AUTO_REPLY_TEXT,
                                mentions: [msg.key.participant]
                            },
                            {
                                statusJidList: [msg.key.participant],
                                quoted: { key: msg.key, message: msg.message }
                            }
                        );
                        break;
                    } catch (error) {
                        retries--;
                        if (retries === 0) console.error('Permanently failed to reply to status:', error);
                        await delay(1000 * (config.MAX_RETRIES - retries + 1));
                    }
                }
            }

            if (statusViewed && sessionConfig.AUTO_LIKE_STATUS === 'true') {
                const emojis = sessionConfig.AUTO_LIKE_EMOJI;
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.sendMessage(
                            msg.key.remoteJid,
                            { react: { text: randomEmoji, key: msg.key } },
                            { statusJidList: [msg.key.participant] }
                        );
                        break;
                    } catch (error) {
                        retries--;
                        if (retries === 0) console.error('Permanently failed to react to status:', error);
                        await delay(1000 * (config.MAX_RETRIES - retries + 1));
                    }
                }
            }

        } catch (error) {
            console.error('Unexpected error in status handler:', error);
        }
    });
}

async function setupMessageHandlers(socket, sanitizedNumber) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message ||
            msg.key.remoteJid === 'status@broadcast' ||
            msg.key.remoteJid === config.NEWSLETTER_JID) return;

        if (!socket.user?.id) return;

        const senderNumber = msg.key.participant
            ? msg.key.participant.split('@')[0]
            : msg.key.remoteJid.split('@')[0];

        const botNumber = jidNormalizedUser(socket.user.id).split('@')[0];
        const isReact = msg.message.reactionMessage;
        const from = msg.key.remoteJid;
        const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        const isGroup = from.endsWith('@g.us');

        const resolvedNumber = sanitizedNumber || botNumber.replace(/[^0-9]/g, '');
        const sessionConfig = activeSockets.get(resolvedNumber)?.config || config;
        const isBotMsg = senderNumber === botNumber;

        if (sessionConfig.AUTO_TYPING === 'true') {
            try { await socket.sendPresenceUpdate('composing', from); } catch {}
        }
        if (sessionConfig.AUTO_RECORDING === 'true') {
            try { await socket.sendPresenceUpdate('recording', from); } catch {}
        }

        if (sessionConfig.ANTI_BOT === 'true' && !isBotMsg && isGroup) {
            try {
                const groupMetadata = await socket.groupMetadata(from);
                const participants = groupMetadata.participants || [];
                const groupAdmins = participants.filter(p => p.admin).map(p => p.id);
                const isAdminMember = groupAdmins.includes(msg.key.participant);
                if (!isAdminMember) {
                    await socket.sendMessage(from, {
                        text: `🤖 Bot Detected!!\nKicked *@${senderNumber}*`,
                        mentions: [msg.key.participant]
                    });
                    await socket.groupParticipantsUpdate(from, [msg.key.participant], 'remove');
                    return;
                }
            } catch (err) {
                console.error('ANTI_BOT error:', err.message);
            }
        }

        if (sessionConfig.ANTI_BAD === 'true' && !isBotMsg) {
            try {
                const badWords = await fetchJson('https://devil-tech-md-data-base.pages.dev/bad_word.json');
                for (const word of badWords) {
                    if (body.toLowerCase().includes(word)) {
                        await socket.sendMessage(from, { text: '*Bad word detected!*' });
                        if (isGroup) await socket.groupParticipantsUpdate(from, [msg.key.participant], 'remove');
                        return;
                    }
                }
            } catch (err) {
                console.error('Failed to fetch bad words:', err);
            }
        }

        if (sessionConfig.ANTI_LINK === 'true' && isGroup && body.includes('chat.whatsapp.com')) {
            await socket.sendMessage(from, { text: '*「 ⚠️ LINK DELETED ⚠️ 」*' });
            await socket.sendMessage(from, { delete: msg.key });
            return;
        }

        if (sessionConfig.AUTO_READ === 'true') {
            try { await socket.sendReadReceipt(from, senderNumber, [msg.key.id]); } catch {}
        }
        if (sessionConfig.ALWAYS_OFFLINE === 'true') {
            try { await socket.sendPresenceUpdate('unavailable'); } catch {}
        }
        if (sessionConfig.ALWAYS_ONLINE === 'true') {
            try { await socket.sendPresenceUpdate('available'); } catch {}
        }

        if (!isReact && senderNumber !== botNumber && sessionConfig.AUTO_REACT === 'true') {
            const reactions = ['😊', '👍', '😂', '💯', '🔥', '🙏', '🎉', '👏', '😎', '🤖'];
            const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
            try {
                await socket.sendMessage(msg.key.remoteJid, {
                    react: { text: randomReaction, key: msg.key }
                });
            } catch (error) {
                console.error('Auto react error:', error);
            }
        }
    });
}

async function setupCommandHandlers(socket, number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');

    let sessionConfig = await loadUserConfig(sanitizedNumber);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });

    socket.ev.on('call', async (callEvents) => {
        const currentConfig = activeSockets.get(sanitizedNumber)?.config || config;
        const recentCallers = new Set();

        if (currentConfig.ANTI_CALL === 'true') {
            for (const callEvent of callEvents) {
                if (callEvent.status === 'offer' && !callEvent.isGroup) {
                    try {
                        if (!recentCallers.has(callEvent.from)) {
                            await socket.sendMessage(callEvent.from, {
                                text: '*_📞 Call Rejected Automatically ⚠️_*\n\n*_• Anti-Call is enabled on this number_*\n*_• Please send a text message instead_*\n\n*_📞 ඔබගේ ඇමතුම ස්වයංක්‍රීයව ප්‍රතික්ෂේප කරන ලදී ⚠️_*\n*_• කරුණාකර text message එකක් යවන්න_*',
                                mentions: [callEvent.from]
                            });
                            recentCallers.add(callEvent.from);
                            setTimeout(() => recentCallers.delete(callEvent.from), 60000);
                        }
                        await socket.rejectCall(callEvent.id, callEvent.from);
                        console.log(`[Anti-Call] Rejected call from ${callEvent.from} for bot ${sanitizedNumber}`);
                    } catch (error) {
                        console.error(`[Anti-Call] Error for ${sanitizedNumber}:`, error);
                    }
                }
            }
        }
    });

    socket.ev.on('group-participants.update', async (update) => {
        const currentConfig = activeSockets.get(sanitizedNumber)?.config || config;
        if (currentConfig.WELCOME_GOODBYE !== 'true') return;

        const groupId = update.id;
        try {
            const groupMetadata = await socket.groupMetadata(groupId);
            const groupName = groupMetadata.subject;

            for (const participant of update.participants) {
                if (update.action === 'add') {
                    await socket.sendMessage(groupId, {
                        text: `*_👋 Welcome to ${groupName}! 🎉_*\n\n*_• @${participant.split('@')[0]} just joined the group_*\n*_• We're happy to have you here!_*\n\n*_👋 ${groupName} වෙත සාදරයෙන් පිළිගනිමු! 🎉_*\n*_• ඔබව මෙහි දැකීම සතුටක්_*`,
                        mentions: [participant]
                    });
                } else if (update.action === 'remove' || update.action === 'leave') {
                    await socket.sendMessage(groupId, {
                        text: `*_👋 Goodbye! 😢_*\n\n*_• @${participant.split('@')[0]} left the group_*\n*_• We'll miss you!_*\n\n*_👋 ගිහින් එනවා! 😢_*\n*_• ඔබව මග හැරෙනවා_*`,
                        mentions: [participant]
                    });
                }
            }
        } catch (error) {
            console.error(`[Welcome/Goodbye] Error for ${sanitizedNumber}:`, error);
        }
    });

    socket.ev.on('messages.upsert', async ({ messages }) => {
        const catboxUrl = 'https://i.ibb.co/b5TnYqYG/tourl-1765446976551.jpg';
        let thumb;
        try { thumb = await urlToBuffer(catboxUrl); } catch { thumb = null; } 

        const DEVELOPER_NEXUS_minibot = {
            key: {
                fromMe: false,
                participant: "0@s.whatsapp.net",
                remoteJid: "status@broadcast"
            },
            message: {
                interactiveMessage: {
                    header: {
                        hasMediaAttachment: true,
                        jpegThumbnail: thumb
                    },
                    nativeFlowMessage: {
                        buttons: [
                            {
                                name: "review_and_pay",
                                buttonParamsJson: JSON.stringify({
                                    currency: "LKR",
                                    payment_configuration: "",
                                    payment_type: "",
                                    total_amount: { value: 72050000, offset: 100 },
                                    reference_id: "X",
                                    type: "physical-goods",
                                    order: {
                                        status: "preparing_to_ship",
                                        description: "",
                                        subtotal: { value: 72050000, offset: 100 },
                                        order_type: "ORDER",
                                        items: [{
                                            retailer_id: "25127408720248432",
                                            product_id: "25127408720248432",
                                            name: "Dᴛᴢ - ᴍɪɴɪ ᴡᴀ ʙᴏᴛ",
                                            amount: { value: 72050000, offset: 100 },
                                            quantity: 1
                                        }]
                                    },
                                    additional_note: "",
                                    native_payment_methods: [],
                                    share_payment_status: false
                                })
                            }
                        ]
                    }
                }
            }
        };

        const msg = messages[0];
        if (!msg.message) return;

        if (!socket.user?.id) return;

        let type = getContentType(msg.message);
        msg.message = (type === 'ephemeralMessage')
            ? msg.message.ephemeralMessage.message
            : msg.message;
        type = getContentType(msg.message);

        const m = sms(socket, msg);

        const quoted = (type === "extendedTextMessage" &&
            msg.message.extendedTextMessage.contextInfo != null)
            ? msg.message.extendedTextMessage.contextInfo.quotedMessage || []
            : [];

        const body = (type === 'conversation')
            ? msg.message.conversation
            : msg.message?.extendedTextMessage?.contextInfo?.hasOwnProperty('quotedMessage')
                ? msg.message.extendedTextMessage.text
            : (type === 'interactiveResponseMessage')
                ? msg.message.interactiveResponseMessage?.nativeFlowResponseMessage &&
                    JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)?.id
            : (type === 'templateButtonReplyMessage')
                ? msg.message.templateButtonReplyMessage?.selectedId
            : (type === 'extendedTextMessage')
                ? msg.message.extendedTextMessage.text
            : (type === 'imageMessage') && msg.message.imageMessage.caption
                ? msg.message.imageMessage.caption
            : (type === 'videoMessage') && msg.message.videoMessage.caption
                ? msg.message.videoMessage.caption
            : (type === 'buttonsResponseMessage')
                ? msg.message.buttonsResponseMessage?.selectedButtonId
            : (type === 'listResponseMessage')
                ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId
            : (type === 'messageContextInfo')
                ? (msg.message.buttonsResponseMessage?.selectedButtonId ||
                    msg.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
                    msg.text)
            : (type === 'viewOnceMessage')
                ? msg.message[type]?.message[getContentType(msg.message[type].message)]
            : (type === "viewOnceMessageV2")
                ? (msg.message[type]?.message?.imageMessage?.caption ||
                    msg.message[type]?.message?.videoMessage?.caption || "")
            : '';

        if (!body) return;

        const text = body;
        const isCmd = text.startsWith(sessionConfig.PREFIX || '.');
        const sender = msg.key.remoteJid;
        const from = sender;

        const nowsender = msg.key.fromMe
            ? (socket.user.id.split(':')[0] + '@s.whatsapp.net')
            : (msg.key.participant || msg.key.remoteJid);

        const senderNumber = nowsender.split('@')[0];
        const developers = config.OWNER_NUMBER.join(',');
        const botNumber = socket.user.id.split(':')[0];

        const isFromMe = msg.key.fromMe || sender === socket.user.id;
        const isbot = botNumber.includes(senderNumber);
        const isOwner = isbot || developers.includes(senderNumber);
        const isGroup = msg.key.remoteJid.endsWith('@g.us');

        const currentConfig = activeSockets.get(sanitizedNumber)?.config || sessionConfig;

        if (!isOwner && currentConfig.MODE === 'private') return;
        if (!isOwner && isGroup && currentConfig.MODE === 'inbox') return;
        if (!isOwner && !isGroup && currentConfig.MODE === 'groups') return;

        if (body && currentConfig.AUTO_VOICE === 'true' && !isFromMe) {
            try {
                const voiceData = await loadPakeData();
                const lowerText = body.toLowerCase().trim();
                const words = lowerText.split(/\s+/);

                for (const key in voiceData) {
                    if (words.includes(key.toLowerCase())) {
                        await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
                        const tempMp3 = path.join("/tmp", `voice_${Date.now()}.mp3`);
                        const tempOpus = path.join("/tmp", `voice_${Date.now()}.opus`);

                        const mp3Data = await axios.get(voiceData[key], { responseType: "arraybuffer" });
                        fs.writeFileSync(tempMp3, Buffer.from(mp3Data.data));

                        await new Promise((resolve, reject) => {
                            ffmpeg(tempMp3)
                                .audioCodec("libopus")
                                .format("opus")
                                .save(tempOpus)
                                .on("end", resolve)
                                .on("error", reject);
                        });

                        const opusBuffer = fs.readFileSync(tempOpus);
                        await socket.sendMessage(sender, {
                            audio: opusBuffer,
                            mimetype: "audio/ogg; codecs=opus",
                            ptt: true
                        }, { quoted: msg });

                        try { fs.unlinkSync(tempMp3); } catch {}
                        try { fs.unlinkSync(tempOpus); } catch {}
                        break;
                    }
                }
            } catch (err) {
                console.error('AUTO_VOICE error:', err.message);
            }
        }

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo || {};
        const botId = socket.user.id.split(':')[0];
        const mentionedJid = contextInfo.mentionedJid || [];
        const isMentioned = mentionedJid.some(jid => jid && jid.split(':')[0] === botId);
        const isReplyToBot = contextInfo.participant?.split(':')[0] === botId;

        if (body && !isFromMe && currentConfig.AUTO_REPLY === 'true' &&
            (!isGroup || isMentioned || isReplyToBot)) {
            try {
                const replyData = await loadhutteData();
                const lowerText = body.toLowerCase().trim();
                const words = lowerText.split(/\s+/);
                for (const key in replyData) {
                    if (words.includes(key.toLowerCase())) {
                        await socket.sendMessage(from, { text: replyData[key] }, { quoted: msg });
                        break;
                    }
                }
            } catch (err) {
                console.log("Auto reply error:", err.message);
            }
        }

        if (body && !isFromMe && currentConfig.AUTO_AI === 'true' &&
            (!isGroup || isMentioned || isReplyToBot)) {
            try {
                await socket.sendPresenceUpdate('composing', from);
                const apiUrl = `https://DEVELOPER NEXUS -api-pi.vercel.app/api/ai/openai?prompt=${encodeURIComponent(body)}`;
                const res = await axios.get(apiUrl, { timeout: 30000, validateStatus: s => s < 500 });
                if (res.data?.status && res.data?.data) {
                    await socket.sendMessage(from, { text: res.data.data }, { quoted: msg });
                }
            } catch (apiErr) {
                if (apiErr.code === 'ECONNABORTED') {
                    await socket.sendMessage(from, { text: "⏳ AI response timeout. Try again." }, { quoted: msg });
                } else {
                    console.log("AI Error:", apiErr.message);
                }
            } finally {
                await socket.sendPresenceUpdate('paused', from);
            }
        }

        if (!isCmd) return;

        const botCount = await axios
            .get('https://coun-api.vercel.app/', { timeout: 5000 })
            .then(res => (res.data && typeof res.data.totalCount === 'number') ? res.data.totalCount : 0)
            .catch(() => 0);

        const prefix = currentConfig.PREFIX || '.';
        const parts = text.slice(prefix.length).trim().split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);
        const match = text.slice(prefix.length).trim();

        const groupMetadata = isGroup ? await socket.groupMetadata(msg.key.remoteJid) : {};
        const participants = groupMetadata.participants || [];
        const groupAdmins = participants.filter(p => p.admin).map(p => p.id);
        const isBotAdmins = groupAdmins.includes(socket.user.id);
        const isAdmins = groupAdmins.includes(sender);

        const reply = async (text, options = {}) => {
            await socket.sendMessage(msg.key.remoteJid, { text, ...options }, { quoted: msg });
        };

        try {
            switch (command) {
case 'settings':
case 'setting':
case 'st':
case 'DEVELOPER NEXUS ': {
    await socket.sendMessage(sender, {
        react: { text: '⚙️', key: msg.key }
    });

    if (!isOwner) {
        return await socket.sendMessage(sender, {
            text: `*_• ඔයාට \`DEVELOPER NEXUS  Mini Bot\` වැඩ කරන්නෙ නැහැ ‼️_*\n> Our Bot Is Not Working For You ‼️\n\n*_• Bot ව ඔයාගෙ Number එකට Connect කරගන්න ඕනිනම් ✅_*\n> If You Connect To Our Bot ✅\n\n_*.freebot <ඔයාගෙ නම්බර් එක*_\n> _*.freebot <Your Number>*_\n\n*⭕ Example -: .freebot 94xxxxxxxxx*\n*📍 Web Site Link -: ${config.PAIR}*\n\n> © ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    try {
        const settingsText =
            `*Wᴇʟᴄᴏᴍᴇ Tᴏ ${sessionConfig.NAME} Sᴇᴛᴛɪɴɢꜱ Pᴀɴᴇʟ ⚙️*\n` +
            `*╭───────────────┈⊷*\n` +
            `*┊• ■ \`ᴘʀᴇꜰɪx\` :* ${sessionConfig.PREFIX}\n` +
            `*┊• ■ \`ᴍᴏᴅᴇ\` :* ${sessionConfig.MODE || 'public'}\n` +
            `*┊• ■ \`ᴀʟᴡᴀʏꜱ ᴏꜰꜰʟɪɴᴇ\` :* ${sessionConfig.ALWAYS_OFFLINE === 'true' ? '✅ ON' : '❌ OFF'}\n` +
            `*┊• ■ \`ᴀʟᴡᴀʏꜱ ᴏɴʟɪɴᴇ\` :* ${sessionConfig.ALWAYS_ONLINE === 'true' ? '✅ ON' : '❌ OFF'}\n` +
            `*┊• ■ \`ᴀᴜᴛᴏ ᴠɪᴇᴡ\` :* ${sessionConfig.AUTO_VIEW_STATUS === 'true' ? '✅ ON' : '❌ OFF'}\n` +
            `*┊• ■ \`ᴀᴜᴛᴏ ʀᴇᴘʟʏ ꜱᴛᴀᴛᴜꜱ\` :* ${sessionConfig.AUTO_REPLY_STATUS === 'true' ? '✅ ON' : '❌ OFF'}\n` +
            `*┊• ■ \`ᴀᴜᴛᴏ ʟɪᴋᴇ\` :* ${sessionConfig.AUTO_LIKE_STATUS === 'true' ? '✅ ON' : '❌ OFF'}\n` +
            `*┊• ■ \`ᴀɴᴛɪ ᴄᴀʟʟ\` :* ${sessionConfig.ANTI_CALL === 'true' ? '✅ ON' : '❌ OFF'}\n` +
            `*┊• ■ \`ᴀᴜᴛᴏ ᴠᴏɪᴄᴇ\` :* ${sessionConfig.AUTO_VOICE === 'true' ? '✅ ON' : '❌ OFF'}\n` +
            `*┊• ■ \`ᴀᴜᴛᴏ ʀᴇᴄᴏʀᴅɪɴɢ\` :* ${sessionConfig.AUTO_RECORDING === 'true' ? '✅ ON' : '❌ OFF'}\n` +
            `*┊• ■ \`ᴀᴜᴛᴏ ᴛʏᴘɪɴɢ\` :* ${sessionConfig.AUTO_TYPING === 'true' ? '✅ ON' : '❌ OFF'}\n` +
            `*┊• ■ \`ᴀᴜᴛᴏ ʀᴇᴀᴄᴛ\` :* ${sessionConfig.AUTO_REACT === 'true' ? '✅ ON' : '❌ OFF'}\n` +
            `*┊• ■ \`ᴀᴜᴛᴏ ʀᴇᴀᴅ\` :* ${sessionConfig.AUTO_READ === 'true' ? '✅ ON' : '❌ OFF'}\n` +
            `*┊• ■ \`ᴀɴᴛɪ ʙᴏᴛ\` :* ${sessionConfig.ANTI_BOT === 'true' ? '✅ ON' : '❌ OFF'}\n` +
            `*┊• ■ \`ᴀɴᴛɪ ʙᴀᴅ\` :* ${sessionConfig.ANTI_BAD === 'true' ? '✅ ON' : '❌ OFF'}\n` +
            `*┊• ■ \`ᴀɴᴛɪ ʟɪɴᴋ\` :* ${sessionConfig.ANTI_LINK === 'true' ? '✅ ON' : '❌ OFF'}\n` +
            `*┊• ■ \`ʀᴇᴀᴅ ᴄᴍᴅ ᴏɴʟʏ\` :* ${sessionConfig.READ_CMD_ONLY === 'true' ? '✅ ON' : '❌ OFF'}\n` +
            `*┊• ■ \`ᴀᴜᴛᴏ ʙɪᴏ\` :* ${sessionConfig.AUTO_BIO === 'true' ? '✅ ON' : '❌ OFF'}\n` +
            `*┊• ■ \`ᴀᴜᴛᴏ ᴀɪ\` :* ${sessionConfig.AUTO_AI === 'true' ? '✅ ON' : '❌ OFF'}\n` +
            `*┊• ■ \`ᴀᴜᴛᴏ ʀᴇᴘʟʏ\` :* ${sessionConfig.AUTO_REPLY === 'true' ? '✅ ON' : '❌ OFF'}\n` +
            `*┊• ■ \`ᴡᴇʟᴄᴏᴍᴇ ɢᴏᴏᴅʙʏᴇ\` :* ${sessionConfig.WELCOME_GOODBYE === 'true' ? '✅ ON' : '❌ OFF'}\n` +
            `*┊• ■ \`ʙᴏᴛ ɴᴜᴍʙᴇʀ\` :* +${sanitizedNumber}\n` +
            `*╰───────────────┈⊷*\n\n` +
            `*ꜱᴇʟᴇᴄᴛ ᴀɴ ᴏᴘᴛɪᴏɴ ʙᴇʟᴏᴡ ᴛᴏ ᴄᴏɴꜰɪɢᴜʀᴇ ʏᴏᴜʀ ʙᴏᴛ ⚙️*`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `${sessionConfig.NAME} Sᴇᴛᴛɪɴɢꜱ ⚙️`,
                description: `_ᴄᴏɴꜰɪɢᴜʀᴇ ʏᴏᴜʀ ʙᴏᴛ ꜱᴇᴛᴛɪɴɢꜱ_`,
                thumbnail: { url: `${sessionConfig.IMAGE}` },
                productId: "DEVELOPER NEXUS -SETTINGS-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: `${config.PAIR}`,
                body: settingsText,
                footer: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ* ${sessionConfig.FOOTER}`,
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "⚙️ ᴄʜᴀɴɢᴇ ꜱᴇᴛᴛɪɴɢꜱ",
                            sections: [
                                {
                                    title: "⚙️ ᴍᴀɪɴ ꜱᴇᴛᴛɪɴɢꜱ",
                                    rows: [
                                        {
                                            header: "🔐 ʙᴏᴛ ᴍᴏᴅᴇ",
                                            title: `ᴄᴜʀʀᴇɴᴛ: ${(sessionConfig.MODE || 'public').toUpperCase()}`,
                                            description: "ᴄʜᴀɴɢᴇ ʙᴏᴛ ᴍᴏᴅᴇ",
                                            id: `${sessionConfig.PREFIX}mode_menu`
                                        },
                                        {
                                            header: "📌 ᴘʀᴇꜰɪx",
                                            title: `ᴄᴜʀʀᴇɴᴛ: ${sessionConfig.PREFIX}`,
                                            description: "ᴜꜱᴇ .ꜱᴇᴛᴘʀᴇꜰɪx <ɴᴇᴡ>",
                                            id: `${sessionConfig.PREFIX}prefix_info`
                                        },
                                        {
                                            header: "⚙️ ᴄʜᴀɴɢᴇ ʙᴏᴛ",
                                            title: "ɴᴀᴍᴇ / ꜰᴏᴏᴛᴇʀ / ɪᴍᴀɢᴇ",
                                            description: ".ꜱᴇᴛɴᴀᴍᴇ | .ꜱᴇᴛꜰᴏᴏᴛᴇʀ | .ꜱᴇᴛɪᴍᴀɢᴇ",
                                            id: `${sessionConfig.PREFIX}bot_info`
                                        }
                                    ]
                                },
                                {
                                    title: "🌐 ᴏɴʟɪɴᴇ ꜱᴛᴀᴛᴜꜱ",
                                    rows: [
                                        {
                                            header: "⚫ ᴀʟᴡᴀʏꜱ ᴏꜰꜰʟɪɴᴇ",
                                            title: sessionConfig.ALWAYS_OFFLINE === 'true' ? '✅ ᴛᴜʀɴ ᴏꜰꜰ' : '❌ ᴛᴜʀɴ ᴏɴ',
                                            description: sessionConfig.ALWAYS_OFFLINE === 'true' ? '✓ ᴇɴᴀʙʟᴇᴅ' : '✗ ᴅɪꜱᴀʙʟᴇᴅ',
                                            id: `${sessionConfig.PREFIX}settings_alwaysoffline_${sessionConfig.ALWAYS_OFFLINE === 'true' ? 'off' : 'on'}`
                                        },
                                        {
                                            header: "🟢 ᴀʟᴡᴀʏꜱ ᴏɴʟɪɴᴇ",
                                            title: sessionConfig.ALWAYS_ONLINE === 'true' ? '✅ ᴛᴜʀɴ ᴏꜰꜰ' : '❌ ᴛᴜʀɴ ᴏɴ',
                                            description: sessionConfig.ALWAYS_ONLINE === 'true' ? '✓ ᴇɴᴀʙʟᴇᴅ' : '✗ ᴅɪꜱᴀʙʟᴇᴅ',
                                            id: `${sessionConfig.PREFIX}settings_alwaysOnline_${sessionConfig.ALWAYS_ONLINE === 'true' ? 'off' : 'on'}`
                                        }
                                    ]
                                },
                                {
                                    title: "👁️ ꜱᴛᴀᴛᴜꜱ ꜱᴇᴛᴛɪɴɢꜱ",
                                    rows: [
                                        {
                                            header: "👁️ ᴀᴜᴛᴏ ᴠɪᴇᴡ ꜱᴛᴀᴛᴜꜱ",
                                            title: sessionConfig.AUTO_VIEW_STATUS === 'true' ? '✅ ᴛᴜʀɴ ᴏꜰꜰ' : '❌ ᴛᴜʀɴ ᴏɴ',
                                            description: sessionConfig.AUTO_VIEW_STATUS === 'true' ? '✓ ᴇɴᴀʙʟᴇᴅ' : '✗ ᴅɪꜱᴀʙʟᴇᴅ',
                                            id: `${sessionConfig.PREFIX}settings_autoviewstatus_${sessionConfig.AUTO_VIEW_STATUS === 'true' ? 'off' : 'on'}`
                                        },
                                        {
                                            header: "💬 ᴀᴜᴛᴏ ʀᴇᴘʟʏ ꜱᴛᴀᴛᴜꜱ",
                                            title: sessionConfig.AUTO_REPLY_STATUS === 'true' ? '✅ ᴛᴜʀɴ ᴏꜰꜰ' : '❌ ᴛᴜʀɴ ᴏɴ',
                                            description: sessionConfig.AUTO_REPLY_STATUS === 'true' ? '✓ ᴇɴᴀʙʟᴇᴅ' : '✗ ᴅɪꜱᴀʙʟᴇᴅ',
                                            id: `${sessionConfig.PREFIX}settings_autostatusreply_${sessionConfig.AUTO_REPLY_STATUS === 'true' ? 'off' : 'on'}`
                                        },
                                        {
                                            header: "❤️ ᴀᴜᴛᴏ ʟɪᴋᴇ ꜱᴛᴀᴛᴜꜱ",
                                            title: sessionConfig.AUTO_LIKE_STATUS === 'true' ? '✅ ᴛᴜʀɴ ᴏꜰꜰ' : '❌ ᴛᴜʀɴ ᴏɴ',
                                            description: sessionConfig.AUTO_LIKE_STATUS === 'true' ? '✓ ᴇɴᴀʙʟᴇᴅ' : '✗ ᴅɪꜱᴀʙʟᴇᴅ',
                                            id: `${sessionConfig.PREFIX}settings_autolikestatus_${sessionConfig.AUTO_LIKE_STATUS === 'true' ? 'off' : 'on'}`
                                        }
                                    ]
                                },
                                {
                                    title: "🎯 ᴀᴜᴛᴏ ꜰᴇᴀᴛᴜʀᴇꜱ",
                                    rows: [
                                        {
                                            header: "🔊 ᴀᴜᴛᴏ ʀᴇᴄᴏʀᴅɪɴɢ",
                                            title: sessionConfig.AUTO_RECORDING === 'true' ? '✅ ᴛᴜʀɴ ᴏꜰꜰ' : '❌ ᴛᴜʀɴ ᴏɴ',
                                            description: sessionConfig.AUTO_RECORDING === 'true' ? '✓ ᴇɴᴀʙʟᴇᴅ' : '✗ ᴅɪꜱᴀʙʟᴇᴅ',
                                            id: `${sessionConfig.PREFIX}settings_autorecording_${sessionConfig.AUTO_RECORDING === 'true' ? 'off' : 'on'}`
                                        },
                                        {
                                            header: "⌨️ ᴀᴜᴛᴏ ᴛʏᴘɪɴɢ",
                                            title: sessionConfig.AUTO_TYPING === 'true' ? '✅ ᴛᴜʀɴ ᴏꜰꜰ' : '❌ ᴛᴜʀɴ ᴏɴ',
                                            description: sessionConfig.AUTO_TYPING === 'true' ? '✓ ᴇɴᴀʙʟᴇᴅ' : '✗ ᴅɪꜱᴀʙʟᴇᴅ',
                                            id: `${sessionConfig.PREFIX}settings_autotyping_${sessionConfig.AUTO_TYPING === 'true' ? 'off' : 'on'}`
                                        },
                                        {
                                            header: "😊 ᴀᴜᴛᴏ ʀᴇᴀᴄᴛ",
                                            title: sessionConfig.AUTO_REACT === 'true' ? '✅ ᴛᴜʀɴ ᴏꜰꜰ' : '❌ ᴛᴜʀɴ ᴏɴ',
                                            description: sessionConfig.AUTO_REACT === 'true' ? '✓ ᴇɴᴀʙʟᴇᴅ' : '✗ ᴅɪꜱᴀʙʟᴇᴅ',
                                            id: `${sessionConfig.PREFIX}settings_autoreact_${sessionConfig.AUTO_REACT === 'true' ? 'off' : 'on'}`
                                        },
                                        {
                                            header: "👀 ᴀᴜᴛᴏ ʀᴇᴀᴅ",
                                            title: sessionConfig.AUTO_READ === 'true' ? '✅ ᴛᴜʀɴ ᴏꜰꜰ' : '❌ ᴛᴜʀɴ ᴏɴ',
                                            description: sessionConfig.AUTO_READ === 'true' ? '✓ ᴇɴᴀʙʟᴇᴅ' : '✗ ᴅɪꜱᴀʙʟᴇᴅ',
                                            id: `${sessionConfig.PREFIX}settings_autoread_${sessionConfig.AUTO_READ === 'true' ? 'off' : 'on'}`
                                        },
                                        {
                                            header: "🎤 ᴀᴜᴛᴏ ᴠᴏɪᴄᴇ",
                                            title: sessionConfig.AUTO_VOICE === 'true' ? '✅ ᴛᴜʀɴ ᴏꜰꜰ' : '❌ ᴛᴜʀɴ ᴏɴ',
                                            description: sessionConfig.AUTO_VOICE === 'true' ? '✓ ᴇɴᴀʙʟᴇᴅ' : '✗ ᴅɪꜱᴀʙʟᴇᴅ',
                                            id: `${sessionConfig.PREFIX}settings_autovoice_${sessionConfig.AUTO_VOICE === 'true' ? 'off' : 'on'}`
                                        },
                                        {
                                            header: "📝 ᴀᴜᴛᴏ ʙɪᴏ",
                                            title: sessionConfig.AUTO_BIO === 'true' ? '✅ ᴛᴜʀɴ ᴏꜰꜰ' : '❌ ᴛᴜʀɴ ᴏɴ',
                                            description: sessionConfig.AUTO_BIO === 'true' ? '✓ ᴇɴᴀʙʟᴇᴅ' : '✗ ᴅɪꜱᴀʙʟᴇᴅ',
                                            id: `${sessionConfig.PREFIX}settings_autobio_${sessionConfig.AUTO_BIO === 'true' ? 'off' : 'on'}`
                                        },
                                        {
                                            header: "🗣️ ᴀᴜᴛᴏ ᴀɪ",
                                            title: sessionConfig.AUTO_AI === 'true' ? '✅ ᴛᴜʀɴ ᴏꜰꜰ' : '❌ ᴛᴜʀɴ ᴏɴ',
                                            description: sessionConfig.AUTO_AI === 'true' ? '✓ ᴇɴᴀʙʟᴇᴅ' : '✗ ᴅɪꜱᴀʙʟᴇᴅ',
                                            id: `${sessionConfig.PREFIX}settings_auto_ai_${sessionConfig.AUTO_AI === 'true' ? 'off' : 'on'}`
                                        },
                                        {
                                            header: "💬 ᴀᴜᴛᴏ ʀᴇᴘʟʏ",
                                            title: sessionConfig.AUTO_REPLY === 'true' ? '✅ ᴛᴜʀɴ ᴏꜰꜰ' : '❌ ᴛᴜʀɴ ᴏɴ',
                                            description: sessionConfig.AUTO_REPLY === 'true' ? '✓ ᴇɴᴀʙʟᴇᴅ' : '✗ ᴅɪꜱᴀʙʟᴇᴅ',
                                            id: `${sessionConfig.PREFIX}settings_auto_reply_${sessionConfig.AUTO_REPLY === 'true' ? 'off' : 'on'}`
                                        },
                                        {
                                            header: "🗣️ ᴡᴇʟᴄᴏᴍᴇ ɢᴏᴏᴅʙʏᴇ",
                                            title: sessionConfig.WELCOME_GOODBYE === 'true' ? '✅ ᴛᴜʀɴ ᴏꜰꜰ' : '❌ ᴛᴜʀɴ ᴏɴ',
                                            description: sessionConfig.WELCOME_GOODBYE === 'true' ? '✓ ᴇɴᴀʙʟᴇᴅ' : '✗ ᴅɪꜱᴀʙʟᴇᴅ',
                                            id: `${sessionConfig.PREFIX}settings_welcome_${sessionConfig.WELCOME_GOODBYE === 'true' ? 'off' : 'on'}`
                                        }
                                    ]
                                },
                                {
                                    title: "🚨 ᴀɴᴛɪ ꜱᴇᴛᴛɪɴɢꜱ",
                                    rows: [
                                        {
                                            header: "🤖 ᴀɴᴛɪ ʙᴏᴛ",
                                            title: sessionConfig.ANTI_BOT === 'true' ? '✅ ᴛᴜʀɴ ᴏꜰꜰ' : '❌ ᴛᴜʀɴ ᴏɴ',
                                            description: sessionConfig.ANTI_BOT === 'true' ? '✓ ᴇɴᴀʙʟᴇᴅ' : '✗ ᴅɪꜱᴀʙʟᴇᴅ',
                                            id: `${sessionConfig.PREFIX}settings_antibot_${sessionConfig.ANTI_BOT === 'true' ? 'off' : 'on'}`
                                        },
                                        {
                                            header: "⛔ ᴀɴᴛɪ ʙᴀᴅ",
                                            title: sessionConfig.ANTI_BAD === 'true' ? '✅ ᴛᴜʀɴ ᴏꜰꜰ' : '❌ ᴛᴜʀɴ ᴏɴ',
                                            description: sessionConfig.ANTI_BAD === 'true' ? '✓ ᴇɴᴀʙʟᴇᴅ' : '✗ ᴅɪꜱᴀʙʟᴇᴅ',
                                            id: `${sessionConfig.PREFIX}settings_antibad_${sessionConfig.ANTI_BAD === 'true' ? 'off' : 'on'}`
                                        },
                                        {
                                            header: "🔗 ᴀɴᴛɪ ʟɪɴᴋ",
                                            title: sessionConfig.ANTI_LINK === 'true' ? '✅ ᴛᴜʀɴ ᴏꜰꜰ' : '❌ ᴛᴜʀɴ ᴏɴ',
                                            description: sessionConfig.ANTI_LINK === 'true' ? '✓ ᴇɴᴀʙʟᴇᴅ' : '✗ ᴅɪꜱᴀʙʟᴇᴅ',
                                            id: `${sessionConfig.PREFIX}settings_antilink_${sessionConfig.ANTI_LINK === 'true' ? 'off' : 'on'}`
                                        },
                                        {
                                            header: "📵 ᴀɴᴛɪ ᴄᴀʟʟ",
                                            title: sessionConfig.ANTI_CALL === 'true' ? '✅ ᴛᴜʀɴ ᴏꜰꜰ' : '❌ ᴛᴜʀɴ ᴏɴ',
                                            description: sessionConfig.ANTI_CALL === 'true' ? '✓ ᴇɴᴀʙʟᴇᴅ' : '✗ ᴅɪꜱᴀʙʟᴇᴅ',
                                            id: `${sessionConfig.PREFIX}settings_anticall_${sessionConfig.ANTI_CALL === 'true' ? 'off' : 'on'}`
                                        }
                                    ]
                                },
                                {
                                    title: "💬 ᴀᴅᴠᴀɴᴄᴇᴅ",
                                    rows: [
                                        {
                                            header: "📜 ʀᴇᴀᴅ ᴄᴍᴅ ᴏɴʟʏ",
                                            title: sessionConfig.READ_CMD_ONLY === 'true' ? '✅ ᴛᴜʀɴ ᴏꜰꜰ' : '❌ ᴛᴜʀɴ ᴏɴ',
                                            description: sessionConfig.READ_CMD_ONLY === 'true' ? '✓ ᴇɴᴀʙʟᴇᴅ' : '✗ ᴅɪꜱᴀʙʟᴇᴅ',
                                            id: `${sessionConfig.PREFIX}settings_readcmdonly_${sessionConfig.READ_CMD_ONLY === 'true' ? 'off' : 'on'}`
                                        }
                                    ]
                                }
                            ]
                        })
                    },
                    {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "« ʙᴀᴄᴋ ᴛᴏ ᴍᴇɴᴜ",
                            id: `${sessionConfig.PREFIX}menu`
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Settings error:', err);
        await socket.sendMessage(sender, {
            text: `❌ Failed to load settings: ${err.message}`
        }, { quoted: DEVELOPER_NEXUS_MINI_BOT });
    }
    break;
}

//================[ mode_menu cmd ]================
case 'mode_menu': {
    await socket.sendMessage(sender, {
        react: { text: '🔐', key: msg.key }
    });
    
    if (!isOwner) {
        return await socket.sendMessage(sender, {
            text: `*_• ඔයාට \`DEVELOPER NEXUS  Mini Bot\` වැඩ කරන්නෙ නැහැ ‼️_*\n> Our Bot Is Not Working For You ‼️\n\n*_• Bot ව ඔයාගෙ Number එකට Connect කරගන්න ඕනිනම් ✅_*\n> If You Connect To Our Bot ✅\n\n_*.freebot <ඔයාගෙ නම්බර් එක*_\n> _*.freebot <Your Number>*_\n\n*⭕ Example -: .freebot 94xxxxxxxxx*\n*📍 Web Site Link -: ${config.PAIR}*\n\n> © ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    
    const modeText = 
        `*🔐 SELECT BOT MODE*\n\n` +
        `*Current Mode:* ${(sessionConfig.MODE || 'public').toUpperCase()}\n\n` +
        `*Available Modes:*\n` +
        `• PUBLIC - Bot works for everyone\n` +
        `• PRIVATE - Only owner can use\n` +
        `• INBOX - Only private chats\n` +
        `• GROUPS - Only group chats\n\n` +
        `*Select a mode below:*`;

    const interactiveMessage = {
        body: proto.Message.InteractiveMessage.Body.create({
            text: modeText
        }),
        footer: proto.Message.InteractiveMessage.Footer.create({
            text: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ* ${sessionConfig.FOOTER}`
        }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons: [
                {
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: '🔐 ꜱᴇʟᴇᴄᴛ ᴍᴏᴅᴇ',
                        sections: [
                            {
                                title: '⚙️ ʙᴏᴛ ᴍᴏᴅᴇꜱ',
                                rows: [
                                    {
                                        header: '🌍 PUBLIC MODE',
                                        title: 'Public Mode',
                                        description: 'Bot works for everyone',
                                        id: `${sessionConfig.PREFIX}settings_mode_public`
                                    },
                                    {
                                        header: '🔒 PRIVATE MODE',
                                        title: 'Private Mode',
                                        description: 'Only owner can use',
                                        id: `${sessionConfig.PREFIX}settings_mode_private`
                                    },
                                    {
                                        header: '💬 INBOX MODE',
                                        title: 'Inbox Mode',
                                        description: 'Only private chats',
                                        id: `${sessionConfig.PREFIX}settings_mode_inbox`
                                    },
                                    {
                                        header: '👥 GROUPS MODE',
                                        title: 'Groups Mode',
                                        description: 'Only group chats',
                                        id: `${sessionConfig.PREFIX}settings_mode_groups`
                                    }
                                ]
                            }
                        ]
                    })
                },
                {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: '« ʙᴀᴄᴋ ᴛᴏ ꜱᴇᴛᴛɪɴɢꜱ',
                        id: `${sessionConfig.PREFIX}settings`
                    })
                }
            ]
        })
    };

    const msgContent = generateWAMessageFromContent(sender, {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                },
                interactiveMessage: proto.Message.InteractiveMessage.create(interactiveMessage)
            }
        }
    }, { userJid: sender, quoted: DEVELOPER_NEXUS_minibot });

    await socket.relayMessage(sender, msgContent.message, {
        messageId: msgContent.key.id
    });
    break;
}

//================[ prefix_info cmd ]================
case 'prefix_info': {
    await socket.sendMessage(sender, {
        react: { text: '📌', key: msg.key }
    });
    
    if (!isOwner) {
        return await socket.sendMessage(sender, {
            text: `*_• ඔයාට \`DEVELOPER NEXUS  Mini Bot\` වැඩ කරන්නෙ නැහැ ‼️_*\n> Our Bot Is Not Working For You ‼️\n\n*_• Bot ව ඔයාගෙ Number එකට Connect කරගන්න ඕනිනම් ✅_*\n> If You Connect To Our Bot ✅\n\n_*.freebot <ඔයාගෙ නම්බර් එක*_\n> _*.freebot <Your Number>*_\n\n*⭕ Example -: .freebot 94xxxxxxxxx*\n*📍 Web Site Link -: ${config.PAIR}*\n\n> © ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    
    const prefixText = 
        `*📌 CHANGE BOT PREFIX*\n\n` +
        `*Current Prefix:* \`${sessionConfig.PREFIX}\`\n\n` +
        `*How to Change:*\n` +
        `Use the command below to set a new prefix:\n\n` +
        `\`${sessionConfig.PREFIX}setprefix <new_prefix>\`\n\n` +
        `*Examples:*\n` +
        `• ${sessionConfig.PREFIX}setprefix /\n` +
        `• ${sessionConfig.PREFIX}setprefix !\n` +
        `• ${sessionConfig.PREFIX}setprefix #\n` +
        `• ${sessionConfig.PREFIX}setprefix .\n` +
        `• ${sessionConfig.PREFIX}setprefix *\n\n` +
        `*Quick Set Options:*`;

    const interactiveMessage = {
        body: proto.Message.InteractiveMessage.Body.create({
            text: prefixText
        }),
        footer: proto.Message.InteractiveMessage.Footer.create({
            text: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ* ${sessionConfig.FOOTER}`
        }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons: [
                {
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: '📌 ꜱᴇʟᴇᴄᴛ ᴘʀᴇꜰɪx',
                        sections: [
                            {
                                title: '⚙️ ᴄᴏᴍᴍᴏɴ ᴘʀᴇꜰɪxᴇꜱ',
                                rows: [
                                    {
                                        header: '• DOT PREFIX',
                                        title: 'Prefix: .',
                                        description: 'Set prefix to dot (.)',
                                        id: `${sessionConfig.PREFIX}setprefix .`
                                    },
                                    {
                                        header: '/ SLASH PREFIX',
                                        title: 'Prefix: /',
                                        description: 'Set prefix to slash (/)',
                                        id: `${sessionConfig.PREFIX}setprefix /`
                                    },
                                    {
                                        header: '! EXCLAMATION PREFIX',
                                        title: 'Prefix: !',
                                        description: 'Set prefix to exclamation (!)',
                                        id: `${sessionConfig.PREFIX}setprefix !`
                                    },
                                    {
                                        header: '# HASH PREFIX',
                                        title: 'Prefix: #',
                                        description: 'Set prefix to hash (#)',
                                        id: `${sessionConfig.PREFIX}setprefix #`
                                    },
                                    {
                                        header: '* ASTERISK PREFIX',
                                        title: 'Prefix: *',
                                        description: 'Set prefix to asterisk (*)',
                                        id: `${sessionConfig.PREFIX}setprefix *`
                                    }
                                ]
                            },
                            {
                                title: '🔧 ᴀᴅᴅɪᴛɪᴏɴᴀʟ ᴘʀᴇꜰɪxᴇꜱ',
                                rows: [
                                    {
                                        header: '+ PLUS PREFIX',
                                        title: 'Prefix: +',
                                        description: 'Set prefix to plus (+)',
                                        id: `${sessionConfig.PREFIX}setprefix +`
                                    },
                                    {
                                        header: '- MINUS PREFIX',
                                        title: 'Prefix: -',
                                        description: 'Set prefix to minus (-)',
                                        id: `${sessionConfig.PREFIX}setprefix -`
                                    },
                                    {
                                        header: '= EQUALS PREFIX',
                                        title: 'Prefix: =',
                                        description: 'Set prefix to equals (=)',
                                        id: `${sessionConfig.PREFIX}setprefix =`
                                    },
                                    {
                                        header: '$ DOLLAR PREFIX',
                                        title: 'Prefix: $',
                                        description: 'Set prefix to dollar ($)',
                                        id: `${sessionConfig.PREFIX}setprefix $`
                                    },
                                    {
                                        header: '@ AT PREFIX',
                                        title: 'Prefix: @',
                                        description: 'Set prefix to at (@)',
                                        id: `${sessionConfig.PREFIX}setprefix @`
                                    },
                                    {
                                        header: '> GREATER PREFIX',
                                        title: 'Prefix: >',
                                        description: 'Set prefix to greater (>)',
                                        id: `${sessionConfig.PREFIX}setprefix >`
                                    },
                                    {
                                        header: '< LESS PREFIX',
                                        title: 'Prefix: <',
                                        description: 'Set prefix to less (<)',
                                        id: `${sessionConfig.PREFIX}setprefix <`
                                    },
                                    {
                                        header: '& AMPERSAND PREFIX',
                                        title: 'Prefix: &',
                                        description: 'Set prefix to ampersand (&)',
                                        id: `${sessionConfig.PREFIX}setprefix &`
                                    },
                                    {
                                        header: '% PERCENT PREFIX',
                                        title: 'Prefix: %',
                                        description: 'Set prefix to percent (%)',
                                        id: `${sessionConfig.PREFIX}setprefix %`
                                    },
                                    {
                                        header: '^ CARET PREFIX',
                                        title: 'Prefix: ^',
                                        description: 'Set prefix to caret (^)',
                                        id: `${sessionConfig.PREFIX}setprefix ^`
                                    }
                                ]
                            }
                        ]
                    })
                },
                {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: '« ʙᴀᴄᴋ ᴛᴏ ꜱᴇᴛᴛɪɴɢꜱ',
                        id: `${sessionConfig.PREFIX}settings`
                    })
                }
            ]
        })
    };

    const msgContent = generateWAMessageFromContent(sender, {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                },
                interactiveMessage: proto.Message.InteractiveMessage.create(interactiveMessage)
            }
        }
    }, { userJid: sender, quoted: DEVELOPER_NEXUS_minibot });

    await socket.relayMessage(sender, msgContent.message, {
        messageId: msgContent.key.id
    });
    break;
}

//================[ bot_info cmd ]================
case 'bot_info': {
    await socket.sendMessage(sender, {
        react: { text: '🔐', key: msg.key }
    });

    if (!isOwner) {
        return await socket.sendMessage(sender, {
            text: `*_• ඔයාට \`DEVELOPER NEXUS  Mini Bot\` වැඩ කරන්නෙ නැහැ ‼️_*\n> Our Bot Is Not Working For You ‼️\n\n*_• Bot ව ඔයාගෙ Number එකට Connect කරගන්න ඕනිනම් ✅_*\n> If You Connect To Our Bot ✅\n\n_*.freebot <ඔයාගෙ නම්බර් එක*_\n> _*.freebot <Your Number>*_\n\n*⭕ Example -: .freebot 94xxxxxxxxx*\n*📍 Web Site Link -: ${config.PAIR}*\n\n> © ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    const botText =
        `*⚙️HOW TO CHANGE BOT*\n\n` +
        `*Current Change:* ${sessionConfig.PREFIX}\n\n` +
        `*How To Change Bot:*\n` +
        `• ${sessionConfig.PREFIX}setname < add your name >\n` +
        `• ${sessionConfig.PREFIX}setfooter < add your footer name >\n` +
        `• ${sessionConfig.PREFIX}setimage < add your image url >\n\n` +
        `• ${sessionConfig.PREFIX}setsong < add your song url >\n\n` +
        `*ꜱᴇʟᴇᴄᴛ ᴀɴ ᴏᴘᴛɪᴏɴ ʙᴇʟᴏᴡ ᴛᴏ ᴄʜᴀɴɢᴇ ʙᴏᴛ ꜱᴇᴛᴛɪɴɢꜱ:*`;

    const interactiveMessage = {
        body: proto.Message.InteractiveMessage.Body.create({
            text: botText
        }),
        footer: proto.Message.InteractiveMessage.Footer.create({
            text: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ* ${sessionConfig.FOOTER}`
        }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons: [
                {
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: '⚙️ ꜱᴇʟᴇᴄᴛ ꜱᴇᴛᴛɪɴɢ',
                        sections: [
                            {
                                title: '🤖 ʙᴏᴛ ᴄᴜꜱᴛᴏᴍɪᴢᴀᴛɪᴏɴ',
                                rows: [
                                    {
                                        header: '✏️ ʙᴏᴛ ɴᴀᴍᴇ',
                                        title: 'ᴄʜᴀɴɢᴇ ʙᴏᴛ ɴᴀᴍᴇ',
                                        description: `Use: ${sessionConfig.PREFIX}setname <name>`,
                                        id: `${sessionConfig.PREFIX}setname`
                                    },
                                    {
                                        header: '🔖 ʙᴏᴛ ꜰᴏᴏᴛᴇʀ',
                                        title: 'ᴄʜᴀɴɢᴇ ʙᴏᴛ ꜰᴏᴏᴛᴇʀ',
                                        description: `Use: ${sessionConfig.PREFIX}setfooter <footer>`,
                                        id: `${sessionConfig.PREFIX}setfooter`
                                    },
                                    {
                                        header: '🖼️ ʙᴏᴛ ɪᴍᴀɢᴇ',
                                        title: 'ᴄʜᴀɴɢᴇ ʙᴏᴛ ɪᴍᴀɢᴇ',
                                        description: `Use: ${sessionConfig.PREFIX}setimage <url>`,
                                        id: `${sessionConfig.PREFIX}setimage`
                                    },
                                    {
                                        header: '🎧 ʙᴏᴛ ꜱᴏɴɢ',
                                        title: 'ᴄʜᴀɴɢᴇ ʙᴏᴛ ꜱᴏɴɢ',
                                        description: `Use: ${sessionConfig.PREFIX}setsong <url>`,
                                        id: `${sessionConfig.PREFIX}setsong`
                                    }
                                ]
                            }
                        ]
                    })
                },
                {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: '« ʙᴀᴄᴋ ᴛᴏ ꜱᴇᴛᴛɪɴɢꜱ',
                        id: `${sessionConfig.PREFIX}settings`
                    })
                }
            ]
        })
    };

    const msgContent = generateWAMessageFromContent(sender, {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                },
                interactiveMessage: proto.Message.InteractiveMessage.create(interactiveMessage)
            }
        }
    }, { userJid: sender, quoted: DEVELOPER_NEXUS_minibot });

    await socket.relayMessage(sender, msgContent.message, {
        messageId: msgContent.key.id
    });
    break;
}


//================[ setting change cmd ]================
case 'settings_anticall_on':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.ANTI_CALL = 'true';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Anti Call* has been set to *TRUE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_anticall_off':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.ANTI_CALL = 'false';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '❌ *Anti Call* has been set to *FALSE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;


case 'settings_alwaysoffline_on':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.ALWAYS_OFFLINE = 'true';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Always Offline* has been set to *TRUE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_alwaysoffline_off':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.ALWAYS_OFFLINE = 'false';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '❌ *Always Offline* has been set to *FALSE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_alwaysOnline_on':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.ALWAYS_ONLINE = 'true';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Always Online* has been set to *TRUE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_alwaysOnline_off':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.ALWAYS_ONLINE = 'false';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '❌ *Always Online* has been set to *FALSE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_autoviewstatus_on':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_VIEW_STATUS = 'true';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Auto View Status* has been set to *TRUE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_autoviewstatus_off':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_VIEW_STATUS = 'false';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '❌ *Auto View Status* has been set to *FALSE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_autolikestatus_on':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_LIKE_STATUS = 'true';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Auto Like Status* has been set to *TRUE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_autolikestatus_off':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_LIKE_STATUS = 'false';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '❌ *Auto Like Status* has been set to *FALSE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_autostatusreply_on':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_REPLY_STATUS = 'true';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Auto Status Reply* has been set to *TRUE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_autostatusreply_off':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_REPLY_STATUS = 'false';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '❌ *Auto Status Reply* has been set to *FALSE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_autorecording_on':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_RECORDING = 'true';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Auto Recording* has been set to *TRUE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_autorecording_off':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_RECORDING = 'false';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '❌ *Auto Recording* has been set to *FALSE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_autotyping_on':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_TYPING = 'true';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Auto Typing* has been set to *TRUE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_autotyping_off':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_TYPING = 'false';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '❌ *Auto Typing* has been set to *FALSE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_autoreact_on':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_REACT = 'true';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Auto React* has been set to *TRUE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_autoreact_off':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_REACT = 'false';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '❌ *Auto React* has been set to *FALSE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_antibot_on':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.ANTI_BOT = 'true';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Anti Bot* has been set to *TRUE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_antibot_off':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.ANTI_BOT = 'false';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '❌ *Anti Bot* has been set to *FALSE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_antibad_on':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.ANTI_BAD = 'true';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Anti Bad* has been set to *TRUE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_antibad_off':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.ANTI_BAD = 'false';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '❌ *Anti Bad* has been set to *FALSE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_antilink_on':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.ANTI_LINK = 'true';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Anti Link* has been set to *TRUE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_antilink_off':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.ANTI_LINK = 'false';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '❌ *Anti Link* has been set to *FALSE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_readcmdonly_on':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.READ_CMD_ONLY = 'true';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Read CMD Only* has been set to *TRUE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_readcmdonly_off':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.READ_CMD_ONLY = 'false';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '❌ *Read CMD Only* has been set to *FALSE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_autoread_on':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_READ = 'true';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Auto Read* has been set to *TRUE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_autoread_off':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_READ = 'false';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '❌ *Auto Read* has been set to *FALSE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_autobio_on':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_BIO = 'true';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Auto Bio* has been set to *TRUE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_autobio_off':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_BIO = 'false';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '❌ *Auto Bio* has been set to *FALSE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;
    
case 'settings_autovoice_on':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_VOICE = 'true';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Auto Voice* has been set to *TRUE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_autovoice_off':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_VOICE = 'false';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '❌ *Auto Voice* has been set to *False*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;
    
case 'settings_auto_ai_on':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_AI = 'true';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Auto Voice* has been set to *TRUE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;
case 'settings_auto_reply_on':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_REPLY = 'true';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Auto Reply* has been set to *TRUE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;
  
    case 'settings_auto_reply_off':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_REPLY = 'false';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '❌ *Auto Reply* has been set to *False*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;
      
case 'settings_auto_ai_off':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.AUTO_AI = 'false';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '❌ *Auto Voice* has been set to *False*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_welcome_on':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.WELCOME_GOODBYE = 'true';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Auto Voice* has been set to *TRUE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_welcome_off':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.WELCOME_GOODBYE = 'false';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '❌ *Auto Voice* has been set to *False*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_mode_public':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.MODE = 'public';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Mode* has been set to *PUBLIC*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_mode_private':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.MODE = 'private';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Mode* has been set to *PRIVATE*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_mode_inbox':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.MODE = 'inbox';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Mode* has been set to *INBOX*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;

case 'settings_mode_groups':
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    if (!isOwner) return;
    sessionConfig.MODE = 'groups';
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });
    await socket.sendMessage(sender, {
        text: '✅ *Mode* has been set to *GROUPS*'
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;
//================[ setting change cmd end ]================


//================[ setting change cmd 02 ]================
case 'setmode':
case 'setprefix':
case 'setautoreply':
case 'setautoai':
case 'setautoview':
case 'setanticall':
case 'setautovoice':
case 'setautoreplytext':
case 'setautolike':
case 'setautolikeemoji':
case 'setautorecording':
case 'setalwaysonline':
case 'setalwaysoffline':
case 'setautotyping':
case 'setautoreact':
case 'setautoread':
case 'setwelcomegoodbye':
case 'setantibot':
case 'setantibad':
case 'setantilink':
case 'setname':
case 'setfooter':
case 'setimage':
case 'setreadcmdonly':
case 'setautobio':
case 'setsong': {
    await socket.sendMessage(sender, {
        react: { text: '⚙️', key: msg.key }
    });
    
    if (!isOwner) {
        return await socket.sendMessage(sender, {
            text: '*❌ This command is only for bot owner!*'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    const settingType = command.replace('set', '').toLowerCase();
    const value = args[0]?.toLowerCase();

    const settingsMap = {
        'mode': {
            configKey: 'MODE',
            validValues: ['public', 'private', 'inbox', 'groups'],
            usage: `*⚙️ Set Bot Mode*\n\n*Usage:* ${sessionConfig.PREFIX}setmode <mode>\n\n*Available Modes:*\n• public\n• private\n• inbox\n• groups\n\n*Example:* ${sessionConfig.PREFIX}setmode private\n\n*Current Mode:* ${sessionConfig.MODE || 'public'}`,
            uppercase: true
        },
        'prefix': {
            configKey: 'PREFIX',
            validValues: null,
            usage: `*⚙️ Set Bot Prefix*\n\n*Usage:* ${sessionConfig.PREFIX}setprefix <prefix>\n\n*Example:* ${sessionConfig.PREFIX}setprefix /\n\n*Current Prefix:* ${sessionConfig.PREFIX}`,
            uppercase: false
        },
        'autoreply': {
            configKey: 'AUTO_REPLY_STATUS',
            validValues: ['true', 'false', 'on', 'off'],
            usage: `*⚙️ Set Auto Reply Status*\n\n*Usage:* ${sessionConfig.PREFIX}setautoreply <true/false>\n\n*Example:* ${sessionConfig.PREFIX}setautoreply true\n\n*Current Status:* ${sessionConfig.AUTO_REPLY_STATUS}`,
            uppercase: true,
            boolean: true
        },
        'autoai': {
            configKey: 'AUTO_AI',
            validValues: ['true', 'false', 'on', 'off'],
            usage: `*⚙️ Set Auto AI*\n\n*Usage:* ${sessionConfig.PREFIX}setautoai <true/false>\n\n*Example:* ${sessionConfig.PREFIX}setautoai true\n\n*Current Status:* ${sessionConfig.AUTO_AI}`,
            uppercase: true,
            boolean: true
        },
        'autoview': {
            configKey: 'AUTO_VIEW_STATUS',
            validValues: ['true', 'false', 'on', 'off'],
            usage: `*⚙️ Set Auto View Status*\n\n*Usage:* ${sessionConfig.PREFIX}setautoview <true/false>\n\n*Example:* ${sessionConfig.PREFIX}setautoview true\n\n*Current Status:* ${sessionConfig.AUTO_VIEW_STATUS}`,
            uppercase: true,
            boolean: true
        },
        'anticall': {
            configKey: 'ANTI_CALL',
            validValues: ['true', 'false', 'on', 'off'],
            usage: `*⚙️ Set Anti Call*\n\n*Usage:* ${sessionConfig.PREFIX}setanticall <true/false>\n\n*Example:* ${sessionConfig.PREFIX}setanticall true\n\n*Current Status:* ${sessionConfig.ANTI_CALL}`,
            uppercase: true,
            boolean: true
        },
        'autovoice': {
            configKey: 'AUTO_VOICE',
            validValues: ['true', 'false', 'on', 'off'],
            usage: `*⚙️ Set Auto Voice*\n\n*Usage:* ${sessionConfig.PREFIX}setautovoice <true/false>\n\n*Example:* ${sessionConfig.PREFIX}setautovoice true\n\n*Current Status:* ${sessionConfig.AUTO_VOICE}`,
            uppercase: true,
            boolean: true
        },
        'autoreplytext': {
            configKey: 'AUTO_REPLY_MESSAGE',
            validValues: null,
            usage: `*⚙️ Set Auto Reply Message*\n\n*Usage:* ${sessionConfig.PREFIX}setautoreplytext <message>\n\n*Example:* ${sessionConfig.PREFIX}setautoreplytext *status seen 🤍*\n\n*Current Message:* ${sessionConfig.AUTO_REPLY_MESSAGE}`,
            uppercase: false,
            fullText: true
        },
        'autolike': {
            configKey: 'AUTO_LIKE_STATUS',
            validValues: ['true', 'false', 'on', 'off'],
            usage: `*⚙️ Set Auto Like Status*\n\n*Usage:* ${sessionConfig.PREFIX}setautolike <true/false>\n\n*Example:* ${sessionConfig.PREFIX}setautolike true\n\n*Current Status:* ${sessionConfig.AUTO_LIKE_STATUS}`,
            uppercase: true,
            boolean: true
        },
        'autolikeemoji': {
            configKey: 'AUTO_LIKE_EMOJI',
            validValues: null,
            usage: `*⚙️ Set Auto Like Emoji*\n\n*Usage:* ${sessionConfig.PREFIX}setautolikeemoji <emoji>\n\n*Example:* ${sessionConfig.PREFIX}setautolikeemoji ❤️\n\n*Current Emoji:* ${sessionConfig.AUTO_LIKE_EMOJI}`,
            uppercase: false
        },
        'autorecording': {
            configKey: 'AUTO_RECORDING',
            validValues: ['true', 'false', 'on', 'off'],
            usage: `*⚙️ Set Auto Recording*\n\n*Usage:* ${sessionConfig.PREFIX}setautorecording <true/false>\n\n*Example:* ${sessionConfig.PREFIX}setautorecording true\n\n*Current Status:* ${sessionConfig.AUTO_RECORDING}`,
            uppercase: true,
            boolean: true
        },
        'alwaysonline': {
            configKey: 'ALWAYS_ONLINE',
            validValues: ['true', 'false', 'on', 'off'],
            usage: `*⚙️ Set Always Online*\n\n*Usage:* ${sessionConfig.PREFIX}setalwaysonline <true/false>\n\n*Example:* ${sessionConfig.PREFIX}setalwaysonline true\n\n*Current Status:* ${sessionConfig.ALWAYS_ONLINE}`,
            uppercase: true,
            boolean: true
        },
        'alwaysoffline': {
            configKey: 'ALWAYS_OFFLINE',
            validValues: ['true', 'false', 'on', 'off'],
            usage: `*⚙️ Set Always Offline*\n\n*Usage:* ${sessionConfig.PREFIX}setalwaysoffline <true/false>\n\n*Example:* ${sessionConfig.PREFIX}setalwaysoffline true\n\n*Current Status:* ${sessionConfig.ALWAYS_OFFLINE}`,
            uppercase: true,
            boolean: true
        },
        'autotyping': {
            configKey: 'AUTO_TYPING',
            validValues: ['true', 'false', 'on', 'off'],
            usage: `*⚙️ Set Auto Typing*\n\n*Usage:* ${sessionConfig.PREFIX}setautotyping <true/false>\n\n*Example:* ${sessionConfig.PREFIX}setautotyping true\n\n*Current Status:* ${sessionConfig.AUTO_TYPING}`,
            uppercase: true,
            boolean: true
        },
        'autoreact': {
            configKey: 'AUTO_REACT',
            validValues: ['true', 'false', 'on', 'off'],
            usage: `*⚙️ Set Auto React*\n\n*Usage:* ${sessionConfig.PREFIX}setautoreact <true/false>\n\n*Example:* ${sessionConfig.PREFIX}setautoreact true\n\n*Current Status:* ${sessionConfig.AUTO_REACT}`,
            uppercase: true,
            boolean: true
        },
        'autoread': {
            configKey: 'AUTO_READ',
            validValues: ['true', 'false', 'on', 'off'],
            usage: `*⚙️ Set Auto Read*\n\n*Usage:* ${sessionConfig.PREFIX}setautoread <true/false>\n\n*Example:* ${sessionConfig.PREFIX}setautoread true\n\n*Current Status:* ${sessionConfig.AUTO_READ}`,
            uppercase: true,
            boolean: true
        },
        'welcomegoodbye': {
            configKey: 'WELCOME_GOODBYE',
            validValues: ['true', 'false', 'on', 'off'],
            usage: `*⚙️ Set Welcome/Goodbye*\n\n*Usage:* ${sessionConfig.PREFIX}setwelcomegoodbye <true/false>\n\n*Example:* ${sessionConfig.PREFIX}setwelcomegoodbye true\n\n*Current Status:* ${sessionConfig.WELCOME_GOODBYE}`,
            uppercase: true,
            boolean: true
        },
        'antibot': {
            configKey: 'ANTI_BOT',
            validValues: ['true', 'false', 'on', 'off'],
            usage: `*⚙️ Set Anti Bot*\n\n*Usage:* ${sessionConfig.PREFIX}setantibot <true/false>\n\n*Example:* ${sessionConfig.PREFIX}setantibot true\n\n*Current Status:* ${sessionConfig.ANTI_BOT}`,
            uppercase: true,
            boolean: true
        },
        'antibad': {
            configKey: 'ANTI_BAD',
            validValues: ['true', 'false', 'on', 'off'],
            usage: `*⚙️ Set Anti Bad*\n\n*Usage:* ${sessionConfig.PREFIX}setantibad <true/false>\n\n*Example:* ${sessionConfig.PREFIX}setantibad true\n\n*Current Status:* ${sessionConfig.ANTI_BAD}`,
            uppercase: true,
            boolean: true
        },
        'antilink': {
            configKey: 'ANTI_LINK',
            validValues: ['true', 'false', 'on', 'off'],
            usage: `*⚙️ Set Anti Link*\n\n*Usage:* ${sessionConfig.PREFIX}setantilink <true/false>\n\n*Example:* ${sessionConfig.PREFIX}setantilink true\n\n*Current Status:* ${sessionConfig.ANTI_LINK}`,
            uppercase: true,
            boolean: true
        },
        // ✅ NEW: setname, setfooter, setimage
        'name': {
            configKey: 'NAME',
            validValues: null,
            usage: `*⚙️ Set Bot Name*\n\n*Usage:* ${sessionConfig.PREFIX}setname <name>\n\n*Example:* ${sessionConfig.PREFIX}setname MyBot\n\n*Current Name:* ${sessionConfig.BOT_NAME || 'N/A'}`,
            uppercase: false,
            fullText: true
        },
        'footer': {
            configKey: 'FOOTER',
            validValues: null,
            usage: `*⚙️ Set Bot Footer*\n\n*Usage:* ${sessionConfig.PREFIX}setfooter <footer>\n\n*Example:* ${sessionConfig.PREFIX}setfooter © My Bot 2025\n\n*Current Footer:* ${sessionConfig.FOOTER || 'N/A'}`,
            uppercase: false,
            fullText: true
        },
        'image': {
            configKey: 'IMAGE',
            validValues: null,
            usage: `*⚙️ Set Bot Image*\n\n*Usage:* ${sessionConfig.PREFIX}setimage <url>\n\n*Example:* ${sessionConfig.PREFIX}setimage https://example.com/image.jpg\n\n*Current Image:* ${sessionConfig.BOT_IMAGE || 'N/A'}`,
            uppercase: false,
            fullText: false
        },
        'song': {
            configKey: 'DEVELOPER NEXUS _MINI_BOT_AUDIO',
            validValues: null,
            usage: `*⚙️ Set Bot Song*\n\n*Usage:* ${sessionConfig.PREFIX}setsong <url>\n\n*Example:* ${sessionConfig.PREFIX}setsong < song url >\n\n*Current Song:* ${sessionConfig.DEVELOPER NEXUS _MINI_BOT_AUDIO || 'N/A'}`,
            uppercase: false,
            fullText: false
        },
        'readcmdonly': {
            configKey: 'READ_CMD_ONLY',
            validValues: ['true', 'false', 'on', 'off'],
            usage: `*⚙️ Set Read CMD Only*\n\n*Usage:* ${sessionConfig.PREFIX}setreadcmdonly <true/false>\n\n*Example:* ${sessionConfig.PREFIX}setreadcmdonly true\n\n*Current Status:* ${sessionConfig.READ_CMD_ONLY}`,
            uppercase: true,
            boolean: true
        },
        'autobio': {
            configKey: 'AUTO_BIO',
            validValues: ['true', 'false', 'on', 'off'],
            usage: `*⚙️ Set Auto Bio*\n\n*Usage:* ${sessionConfig.PREFIX}setautobio <true/false>\n\n*Example:* ${sessionConfig.PREFIX}setautobio true\n\n*Current Status:* ${sessionConfig.AUTO_BIO}`,
            uppercase: true,
            boolean: true
        }
    };

    const setting = settingsMap[settingType];
    
    if (!setting) {
        return await socket.sendMessage(sender, {
            text: '*❌ Invalid setting command!*'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    let finalValue;
    if (setting.fullText) {
        finalValue = args.join(' ');
        if (!finalValue) {
            return await socket.sendMessage(sender, {
                text: setting.usage
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }
    } else {
        if (!value || (setting.validValues && !setting.validValues.includes(value))) {
            return await socket.sendMessage(sender, {
                text: setting.usage
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        if (setting.boolean) {
            finalValue = (value === 'true' || value === 'on') ? 'true' : 'false';
        } else {
            finalValue = value;
        }
    }

    sessionConfig[setting.configKey] = finalValue;
    await updateUserConfig(sanitizedNumber, sessionConfig);
    activeSockets.set(sanitizedNumber, { socket, config: sessionConfig });

    const displayValue = setting.uppercase ? finalValue.toUpperCase() : finalValue;
    const emoji = setting.boolean ? (finalValue === 'true' ? '✅' : '❌') : '✅';
    
    await socket.sendMessage(sender, {
        text: `${emoji} *${setting.configKey.replace(/_/g, ' ')}* has been set to *${displayValue}*`
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;
}

//================[ tourl cmd ]================
case 'tourl':
case 'imgtourl':
case 'url':
case 'geturl':
case 'upload': {

    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    
    const quoted = msg.message?.extendedTextMessage?.contextInfo;

    if (!quoted || !quoted.quotedMessage) {
        return await socket.sendMessage(sender, {
            text: '❌ Please reply to an image, video, or audio file with .tourl'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    const quotedMsg = {
        key: {
            remoteJid: sender,
            id: quoted.stanzaId,
            participant: quoted.participant
        },
        message: quoted.quotedMessage
    };

    let mediaBuffer;
    let mimeType;
    let fileName;

    if (quoted.quotedMessage.imageMessage) {
        mediaBuffer = await downloadMediaMessage(quotedMsg, 'buffer', {}, {
            logger: console,
            reuploadRequest: socket.updateMediaMessage
        });
        mimeType = 'image/jpeg';
        fileName = 'image.jpg';
    } else if (quoted.quotedMessage.videoMessage) {
        mediaBuffer = await downloadMediaMessage(quotedMsg, 'buffer', {}, {
            logger: console,
            reuploadRequest: socket.updateMediaMessage
        });
        mimeType = 'video/mp4';
        fileName = 'video.mp4';
    } else if (quoted.quotedMessage.audioMessage) {
        mediaBuffer = await downloadMediaMessage(quotedMsg, 'buffer', {}, {
            logger: console,
            reuploadRequest: socket.updateMediaMessage
        });
        mimeType = 'audio/mpeg';
        fileName = 'audio.mp3';
    } else if (quoted.quotedMessage.documentMessage) {
        mediaBuffer = await downloadMediaMessage(quotedMsg, 'buffer', {}, {
            logger: console,
            reuploadRequest: socket.updateMediaMessage
        });
        mimeType = quoted.quotedMessage.documentMessage.mimetype;
        fileName = quoted.quotedMessage.documentMessage.fileName || 'document';
    } else {
        return await socket.sendMessage(sender, {
            text: '❌ Please reply to a valid media file (image, video, audio, or document)'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    const tempFilePath = path.join(os.tmpdir(), `catbox_upload_${Date.now()}`);
    fs.writeFileSync(tempFilePath, mediaBuffer);

    const form = new FormData();
    form.append('fileToUpload', fs.createReadStream(tempFilePath), fileName);
    form.append('reqtype', 'fileupload');

    const response = await axios.post('https://catbox.moe/user/api.php', form, {
        headers: form.getHeaders()
    });

    if (!response.data) {
        fs.unlinkSync(tempFilePath);
        return await socket.sendMessage(sender, {
            text: '❌ Error uploading to Catbox'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    const mediaUrl = response.data.trim();
    fs.unlinkSync(tempFilePath);

    let mediaType = 'File';
    if (mimeType.includes('image')) mediaType = 'Image';
    else if (mimeType.includes('video')) mediaType = 'Video';
    else if (mimeType.includes('audio')) mediaType = 'Audio';

    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    const responseText = `  
╭━━━━━━━━━━━━━━━━━●◌
│ ■ *${mediaType} Uploaded Successfully*
│ ■ Size: *${formatBytes(mediaBuffer.length)}*
│ ■ URL: *${mediaUrl}*
╰━━━━━━━━━━━━━━━━━●◌

> © ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -`;

    const uploadMsg = generateWAMessageFromContent(sender, {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                },
                interactiveMessage: proto.Message.InteractiveMessage.create({
                    body: proto.Message.InteractiveMessage.Body.create({
                        text: responseText
                    }),
                    header: proto.Message.InteractiveMessage.Header.create({
                        title: '*🖇 DEVELOPER NEXUS  URL UPLOAD DONE  ✅*',
                        subtitle: '',
                        hasMediaAttachment: false
                    }),
                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                        buttons: [
                            {
                                name: 'cta_copy',
                                buttonParamsJson: JSON.stringify({
                                    display_text: 'Copy Url',
                                    id: mediaUrl,
                                    copy_code: mediaUrl
                                })
                            }
                        ]
                    })
                })
            }
        }
    }, {});

    await socket.relayMessage(sender, uploadMsg.message, {
        quoted: DEVELOPER_NEXUS_minibot
    });

    break;
}


//================[ alive cmd ]================
case 'alive': {
    await socket.sendMessage(sender, {
        react: {
            text: '🚀',
            key: msg.key
        }
    });

    const date = new Date();
    const slstDate = new Date(date.toLocaleString("en-US", {
        timeZone: "Asia/Colombo"
    }));
    const formattedDate = `${slstDate.getFullYear()}/${slstDate.getMonth() + 1}/${slstDate.getDate()}`;
    const formattedTime = slstDate.toLocaleTimeString();

    const hour = slstDate.getHours();
    const greetings =
        hour < 12 ? '*`සුභ උදෑසනක් 🌄`*' :
        hour < 17 ? '*`සුභ දහවලක් 🏞️`*' :
        hour < 20 ? '*`සුභ හැන්දෑවක් 🌅`*' :
        '*`සුභ රාත්‍රියක් 🌌`*';

    const startTime = Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const aliveText = `*${sessionConfig.NAME} Aʟɪᴠᴇ Nᴏᴡ ☃️*\n╭──────────────┈⊷*\n*┊• 🖼️ \`ɢʀᴇᴇᴛ\` :* ${greetings}\n*┊• ⏰ \`ᴛɪᴍᴇ\` :* *${formattedTime}*\n*┊• 📅 \`ᴅᴀᴛᴇ\` :* *${formattedDate}*\n*┊• ⏰ \`ʀᴜɴᴛɪᴍᴇ\` :* *${hours}h ${minutes}m ${seconds}s*\n*╰──────────────┈⊷*\n*• ʏᴏᴜʀ ᴡʜᴀᴛꜱᴀᴘᴘ ɴᴏ :* *${number}*\n*• ᴀᴄᴛɪᴠᴇ ꜱᴇꜱꜱɪᴏɴꜱ :* *${botCount}*\n\n*🌐 DEVELOPER NEXUS  MINI BOT Website :*\n> ${config.PAIR}`;

    await socket.sendMessage(sender, {
        productMessage: {
            title: "A ʟɪᴠᴇ Nᴏᴡ 🚀",
            description: "Ｗᴇʟᴄᴏᴍᴇ Ｔᴏ Ｄᴛᴢ Ｍɪɴɪ Ｂᴏᴛ ☃️",
            thumbnail: { url: `${sessionConfig.IMAGE}` },
            productId: "DEVELOPER NEXUS -ALIVE-001",
            retailerId: "DEVELOPER NEXUS -TEAM",
            url: "https://whatsapp.com/channel/0029Vb5lyTTE50UljDvt993M",
            body: aliveText,
            footer: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ* ${sessionConfig.FOOTER}`,
            priceAmount1000: 99999999999,
            currencyCode: "LKR",
            buttons: [
            
                                {
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({
                        display_text: "View Web Site",
                        url: "https://darktechzone.site/"
                    })
                }
            ]
        }
    }, { quoted: DEVELOPER_NEXUS_minibot });
    
    await socket.sendMessage(sender, { 
        audio: { url: config.DEVELOPER_NEXUS__MINI_BOT_AUDIO }, 
        mimetype: "audio/mpeg",
        ptt: true
    }, { quoted: DEVELOPER_NEXUS_minibot });
    
    break;
}
        
//================[ system cmd ]================
case 'system': {
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });

    const now = new Date();
    const slTime = new Date(now.toLocaleString("en-US", {
        timeZone: "Asia/Colombo"
    }));

    const uptime = Math.floor(process.uptime());
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    const memUsage = process.memoryUsage();
    const usedMem = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
    const totalMem = Math.round(os.totalmem() / 1024 / 1024);
    const ramPercent = ((memUsage.heapUsed / os.totalmem()) * 100).toFixed(1);
    const freeMem = Math.round(os.freemem() / 1024 / 1024);

    const message = `_*Ｗᴇʟᴄᴏᴍᴇ Ｔᴏ ${sessionConfig.NAME} ☃️*_\n*╭───────────────┈⊷*\n*┊• ⏰ \`ʀᴜɴᴛɪᴍᴇ\` :* *${hours}h ${minutes}m ${seconds}s*\n*┊• 📟 \`ʀᴀᴍ ᴜꜱᴀɢᴇ\` :* *${usedMem}MB / ${totalMem}MB (${ramPercent}%)*\n*┊• ⚖️ \`ᴘʟᴀᴛꜰᴏʀᴍ\` :* *heroku*\n*┊• 💾 \`ꜰʀᴇᴇ ᴍᴇᴍᴏʀʏ\` :* *${freeMem}MB*\n*┊• 🧠 \`ᴄᴘᴜ ᴄᴏʀᴇꜱ\` :* *${os.cpus().length} cores*\n*┊• 📬 \`ᴄʀᴇᴀᴛᴇᴅ ʙʏ\` :* *Dark Tech Zoneᵀᴹ*\n*┊• 🧬 \`ᴠᴇʀꜱɪᴏɴ\` :* *v3.0.0*\n*╰───────────────┈⊷*\n\n`;

    await socket.sendMessage(sender, {
        productMessage: {
            title: "Sʏꜱᴛᴇᴍ Iɴғᴏ 📊",
            description: "Ｄᴛᴢ Ｍɪɴɪ Ｂᴏᴛ Sʏsᴛᴇᴍ Sᴛᴀᴛᴜs 📍",
            thumbnail: { url: `${sessionConfig.IMAGE}` },
            productId: "DEVELOPER NEXUS -SYSTEM-001",
            retailerId: "DEVELOPER NEXUS -TEAM",
            url: "https://whatsapp.com/channel/0029Vb5lyTTE50UljDvt993M",
            body: message,
            footer: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ* ${sessionConfig.FOOTER}`,
            priceAmount1000: 99999999900,
            currencyCode: "LKR",
            buttons: [
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "MENU LIST CMD",
                        id: `${sessionConfig.PREFIX}menu`
                    })
                },
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "ALIVE CMD",
                        id: `${sessionConfig.PREFIX}alive`
                    })
                }
            ]
        }
    }, { quoted: DEVELOPER_NEXUS_minibot });
    
    await socket.sendMessage(sender, { 
        audio: { url: config.DEVELOPER_NEXUS_MINI_BOT_AUDIO }, 
        mimetype: "audio/mpeg",
        ptt: true
    }, { quoted: DEVELOPER_NEXUS_minibot });
    
    break;
}


//================[ menu cmd ]================
case 'menu': {
    
    await socket.sendMessage(sender, {
        react: {
            text: '📍',
            key: msg.key
        }
    });
    
    const date = new Date();
    const slstDate = new Date(date.toLocaleString("en-US", {
        timeZone: "Asia/Colombo"
    }));
    const formattedDate = `${slstDate.getFullYear()}/${slstDate.getMonth() + 1}/${slstDate.getDate()}`;
    const formattedTime = slstDate.toLocaleTimeString();

    const hour = slstDate.getHours();
    const greetings =
        hour < 12 ? '*`සුභ උදෑසනක් 🌄`*' :
        hour < 17 ? '*`සුභ දහවලක් 🏞️`*' :
        hour < 20 ? '*`සුභ හැන්දෑවක් 🌅`*' :
        '*`සුභ රාත්‍රියක් 🌌`*';

    const startTime = Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const uptimeFormatted = `${hours}h ${minutes}m ${seconds}s`;

    let teksnya = `_*Ｗᴇʟᴄᴏᴍᴇ Ｔᴏ ${sessionConfig.NAME} ☃️*_
*╭───────────────┈⊷*
*┊• 🖼️ \`ɢʀᴇᴇᴛ\` :-* ${greetings}
*┊• ⏰ \`ᴛɪᴍᴇ\` :-* *${formattedTime}*
*┊• 📅 \`ᴅᴀᴛᴇ\` :-* *${formattedDate}*
*┊• 🎭 \`ʙᴏᴛ ᴘᴏᴡᴇʀᴇᴅ\` :-* *ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ*
*┊• 📍 \`ʙᴏᴛ ᴄᴏᴜɴᴛ\` :-* *${botCount}*
*╰───────────────┈⊷*

*ʜᴇʟʟᴏ ᴅᴇᴀʀ, ᴡᴇʟᴄᴏᴍᴇ ᴛᴏ ${sessionConfig.NAME} ☃️ , ᴀ ᴍᴜʟᴛɪ ᴅᴇᴠɪᴄᴇ ᴘᴏᴡᴇʀꜰᴜʟ ꜰʀᴇᴇ ʙᴏᴛ. ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ ( ᴅᴛᴢ ɢᴀɴɢ ).*📬

*🌐 DEVELOPER NEXUS  MINI BOT Website :*
> ${config.PAIR}\n`;

    await socket.sendMessage(sender, {
        interactiveMessage: {
            title: teksnya,
            footer: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ* ${sessionConfig.FOOTER}`,
            thumbnail: `${sessionConfig.IMAGE}`,
            nativeFlowMessage: {
                messageParamsJson: JSON.stringify({
                    limited_time_offer: {
                        text: "H ᴇʟʟᴏᴡ ❤️",
                        url: "https://www.darktechzone.site/",
                        copy_code: "ᴏᴡɴᴇʀꜱ : ᴀꜱʜᴜᴜ & ᴅɪɴᴀ",
                        expiration_time: Date.now() * 999
                    },
                    bottom_sheet: {
                        in_thread_buttons_limit: 2,
                        divider_indices: [1, 2, 3, 4, 5, 999],
                        list_title: "𝐃ᴀʀᴋ 𝐓ᴇᴄʜ 𝐙ᴏɴᴇ",
                        button_title: "𝐒ᴇʟᴇᴄᴛ 𝐌ᴇɴᴜ"
                    }
                }),
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({ has_multiple_buttons: true })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "𝐉ᴏɪɴ 𝐂ʜᴀɴɴᴇʟ",
                            url: "https://whatsapp.com/channel/0029Vb5lyTTE50UljDvt993M"
                        })
                    },
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "𝐃ᴛᴢ 𝐌ɪɴɪ 𝐁ᴏᴛ ᴠ3 ☃️ ",
                            sections: [
                                {
                                    title: "𝐌ᴀɪɴ 𝐂ᴀᴛᴇɢᴏʀɪᴇꜱ",
                                    highlight_label: "𝐃ᴛᴢ 𝐌ɪɴɪ 𝐁ᴏᴛ ᴠ𝟑",
                                    rows: [
                                        {
                                            header: "🎮 𝐌ᴀɪɴ 𝐌ᴇɴᴜ",
                                            title: "𝐌ᴀɪɴ 𝐌ᴇɴᴜ",
                                            description: "View all main commands",
                                            id: `${sessionConfig.PREFIX}mainmenu`
                                        },
                                        {
                                            header: "🎌 𝐀ɴɪᴍᴇ 𝐌ᴇɴᴜ",
                                            title: "𝐀ɴɪᴍᴇ 𝐌ᴇɴᴜ",
                                            description: "Anime related commands",
                                            id: `${sessionConfig.PREFIX}animemenu`
                                        },
                                        {
                                            header: "📥 𝐃ᴏᴡɴʟᴏᴀᴅ 𝐌ᴇɴᴜ",
                                            title: "𝐃ᴏᴡɴʟᴏᴀᴅ 𝐌ᴇɴᴜ",
                                            description: "Download media from various platforms",
                                            id: `${sessionConfig.PREFIX}downmenu`
                                        },
                                        {
                                            header: "👥 𝐆ʀᴏᴜᴘ 𝐌ᴇɴᴜ",
                                            title: "𝐆ʀᴏᴜᴘ 𝐌ᴇɴᴜ",
                                            description: "Group management commands",
                                            id: `${sessionConfig.PREFIX}groupmenu`
                                        },
                                        {
                                            header: "🎭 𝐅ᴜɴ 𝐌ᴇɴᴜ",
                                            title: "𝐅ᴜɴ 𝐌ᴇɴᴜ",
                                            description: "Entertainment and fun commands",
                                            id: `${sessionConfig.PREFIX}funmenu`
                                        },
                                        {
                                            header: "🔄 𝐂ᴏɴᴠᴇʀᴛ 𝐌ᴇɴᴜ",
                                            title: "𝐂ᴏɴᴠᴇʀᴛ 𝐌ᴇɴᴜ",
                                            description: "Convert files and media",
                                            id: `${sessionConfig.PREFIX}convertmenu`
                                        },
                                        {
                                            header: "👑 𝐎ᴡɴᴇʀ 𝐌ᴇɴᴜ",
                                            title: "𝐎ᴡɴᴇʀ 𝐌ᴇɴᴜ",
                                            description: "Owner only commands",
                                            id: `${sessionConfig.PREFIX}ownermenu`
                                        },
                                        {
                                            header: "🔍 𝐒ᴇᴀʀᴄʜ 𝐌ᴇɴᴜ",
                                            title: "𝐒ᴇᴀʀᴄʜ 𝐌ᴇɴᴜ",
                                            description: "Search anything you want",
                                            id: `${sessionConfig.PREFIX}searchmenu`
                                        },
                                        {
                                            header: "🤖 𝐀ɪ 𝐌ᴇɴᴜ",
                                            title: "𝐀ɪ 𝐌ᴇɴᴜ",
                                            description: "AI Chat & Image Generate commands",
                                            id: `${sessionConfig.PREFIX}aimenu`
                                        },
                                        {
                                            header: "🗣️ 𝐍ᴇᴡꜱ 𝐌ᴇɴᴜ",
                                            title: "𝐍ᴇᴡꜱ 𝐌ᴇɴᴜ",
                                            description: "Check a news",
                                            id: `${sessionConfig.PREFIX}newsmenu`
                                        },
                                        {
                                            header: "⚙️ 𝐒ᴇᴛᴛɪɴɢ 𝐌ᴇɴᴜ",
                                            title: "𝐒ᴇᴛᴛɪɴɢ 𝐌ᴇɴᴜ",
                                            description: "Bot settings & configuration",
                                            id: `${sessionConfig.PREFIX}settingmenu`
                                        }
                                    ]
                                },
                                {
                                    title: "𝐔ᴛɪʟɪᴛɪᴇꜱ",
                                    highlight_label: "𝐃ᴛᴢ 𝐌ɪɴɪ 𝐁ᴏᴛ ᴠ3",
                                    rows: [
                                        {
                                            header: "🏓 𝐏ɪɴɢ",
                                            title: "𝐏ɪɴɢ",
                                            description: "Check bot speed",
                                            id: `${sessionConfig.PREFIX}ping`
                                        },
                                        {
                                            header: "💚 𝐀ʟɪᴠᴇ",
                                            title: "𝐀ʟɪᴠᴇ",
                                            description: "Check bot status",
                                            id: `${sessionConfig.PREFIX}alive`
                                        },
                                        {
                                            header: "⚙️ 𝐒ᴇᴛᴛɪɴɢꜱ",
                                            title: "𝐒ᴇᴛᴛɪɴɢꜱ",
                                            description: "Check bot settings",
                                            id: `${sessionConfig.PREFIX}st`
                                        },
                                        {
                                            header: "🚀 𝐒ʏꜱᴛᴇᴍ",
                                            title: "𝐒ʏꜱᴛᴇᴍ",
                                            description: "Check bot system",
                                            id: `${sessionConfig.PREFIX}system`
                                        }
                                    ]
                                }
                            ]
                        })
                    },
                    {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "𝐒ᴇᴛᴛɪɴɢ 𝐂ᴍᴅ 📌",
                            id: `${sessionConfig.PREFIX}DEVELOPER NEXUS `
                        })
                    },
                    {
                        name: "cta_copy",
                        buttonParamsJson: JSON.stringify({
                            display_text: "𝐂ᴏᴘʏ 𝐖ᴇʙ 𝐋ɪɴᴋ",
                            copy_code: "*~https://www.darktechzone.site/~*"
                        })
                    }
                ]
            }
        }
    }, {
        quoted: DEVELOPER_NEXUS_minibot
    });
    
    await socket.sendMessage(sender, { 
        audio: { url: config.DEVELOPER_NEXUS_MINI_BOT_AUDIO }, 
        mimetype: "audio/mpeg",
        ptt: true
    }, { quoted: DEVELOPER_NEXUS_minibot });

    break;
}

//================[ downmenu cmd ]================
case 'downmenu': {
    await socket.sendMessage(sender, {
        react: { text: '📍', key: msg.key }
    });

    let message = `*_${sessionConfig.NAME} Dᴏᴡɴʟᴏᴀᴅ Mᴇɴᴜ ☃️_*
╭────────────────┈⊷
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}Song\`*
┋  *📃 Usage :* Download Songs
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}csend,csong\`*
┋  *📃 Usage :* Send A Audio Type Song For Channel
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}video\`*
┋  *📃 Usage :* Download Videos
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}fb\`*
┋  *📃 Usage :* Download Fb Videos
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}tiktok\`*
┋  *📃 Usage :* Download Tiktok Videos
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}mediafire\`*
┋  *📃 Usage :* Download mediafire file
┇ 
┋ *📍 Command : \`${sessionConfig.PREFIX}ig\`*
┋  *📃 Usage :* Download Instagram Videos
┇ 
┋ *📍 Command : \`${sessionConfig.PREFIX}apk\`*
┋  *📃 Usage :* Download apk file
┇ 
┋ *📍 Command : \`${sessionConfig.PREFIX}xnxx\`*
┋  *📃 Usage : Download The Xnxx Video* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}xvideo\`*
┋  *📃 Usage : Download The X Video* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}jilhub\`*
┋  *📃 Usage : Download The Jilhub Video* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}xhamster\`*
┋  *📃 Usage : Download The X Hamster* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}xnxxtv\`*
┋  *📃 Usage : Download The Xnxxtv Video* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}douyin\`*
┋  *📃 Usage : Download The Douyin Video Or Image* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}twitter\`*
┋  *📃 Usage : Download The Twitter Video* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}sinhalanda\`*
┋  *📃 Usage : Download The Sinhalanda Song* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}soundcloud\`*
┋  *📃 Usage : Download The Soundcloud Song* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}threads\`*
┋  *📃 Usage : Download The Threads Video* 
┇
╰────────────────┈⊷

*🌐 DEVELOPER NEXUS  MINI BOT Website :*
> ${config.PAIR}`;

    await socket.sendMessage(sender, {
        productMessage: {
            title: "Dᴏᴡɴʟᴏᴀᴅ Mᴇɴᴜ 📥",
            description: "Ｄᴛᴢ Ｍɪɴɪ Ｂᴏᴛ Dᴏᴡɴʟᴏᴀᴅ Cᴏᴍᴍᴀɴᴅs 📍",
            thumbnail: { url: `${sessionConfig.IMAGE}` },
            productId: "DEVELOPER NEXUS -DOWNLOAD-001",
            retailerId: "DEVELOPER NEXUS -TEAM",
            url: "https://whatsapp.com/channel/0029Vb5lyTTE50UljDvt993M",
            body: message,
            footer: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ* ${sessionConfig.FOOTER}`,
            priceAmount1000: 99999999900,
            currencyCode: "LKR",
            buttons: [
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "MENU LIST CMD",
                        id: `${sessionConfig.PREFIX}menu`
                    })
                },
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "ALIVE CMD",
                        id: `${sessionConfig.PREFIX}alive`
                    })
                }
            ]
        }
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;
}

case 'mainmenu': {
    await socket.sendMessage(sender, {
        react: { text: '📍', key: msg.key }
    });

    let message = `*_${sessionConfig.NAME} Mᴀɪɴ Mᴇɴᴜ ☃️_*
╭────────────────┈⊷
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}ping\`*
┋  *📃 Usage : Check The Bot Speed*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}alive\`*
┋  *📃 Usage : Change Or Check Bot Alive*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}system\`*
┋  *📃 Usage : Change Or Check Bot System*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}settings\`*
┋  *📃 Usage : Change Or Check Bot Settings*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}save\`*
┋  *📃 Usage : Status Save Command*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}vv / ${sessionConfig.PREFIX}😂😂 / ${sessionConfig.PREFIX}❤️❤️ / ${sessionConfig.PREFIX}😭😭\`*
┋  *📃 Usage : See Viewone Message*
┇ 
┋ *📍 Command : \`${sessionConfig.PREFIX}vv2\`*
┋  *📃 Usage : See Viewone Message 02*
┇ 
┋ *📍 Command : \`${sessionConfig.PREFIX}jid\`*
┋  *📃 Usage : Channel, Group and Inbox Jid Send*
┇ 
┋ *📍 Command : \`${sessionConfig.PREFIX}getdp\`*
┋  *📃 Usage : Getdp command*
┇ 
┋ *📍 Command : \`${sessionConfig.PREFIX}winfo\`*
┋  *📃 Usage : Whatsapp info command*
┇ 
┋ *📍 Command : \`${sessionConfig.PREFIX}chr\`*
┋  *📃 Usage : Follow The Channel*
┇ 
┋ *📍 Command : \`${sessionConfig.PREFIX}pair / ${sessionConfig.PREFIX}freebot / ${sessionConfig.PREFIX}bot\`*
┋  *📃 Usage : Get Pair Code To Connect Whatsapp*
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}font\`*
┋  *📃 Usage : Take A Font Image* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}fancy\`*
┋  *📃 Usage : Take A Font Style* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}saveweb\`*
┋  *📃 Usage : Download A Website Script* 
┇
╰────────────────┈⊷

*🌐 DEVELOPER NEXUS  MINI BOT Website :*
> ${config.PAIR}`;

    await socket.sendMessage(sender, {
        productMessage: {
            title: "Mᴀɪɴ Mᴇɴᴜ 🏠",
            description: "Ｄᴛᴢ Ｍɪɴɪ Ｂᴏᴛ Mᴀɪɴ Cᴏᴍᴍᴀɴᴅs 📍",
            thumbnail: { url: `${sessionConfig.IMAGE}` },
            productId: "DEVELOPER NEXUS -MAIN-001",
            retailerId: "DEVELOPER NEXUS -TEAM",
            url: "https://whatsapp.com/channel/0029Vb5lyTTE50UljDvt993M",
            body: message,
            footer: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ* ${sessionConfig.FOOTER}`,
            priceAmount1000: 99999999900,
            currencyCode: "LKR",
            buttons: [
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "MENU LIST CMD",
                        id: `${sessionConfig.PREFIX}menu`
                    })
                },
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "ALIVE CMD",
                        id: `${sessionConfig.PREFIX}alive`
                    })
                }
            ]
        }
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;
}

case 'funmenu': {
    await socket.sendMessage(sender, {
        react: { text: '📍', key: msg.key }
    });

    let message = `*_${sessionConfig.NAME} Fᴜɴ Mᴇɴᴜ ☃️_*
╭────────────────┈⊷
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}angry\`*
┋  *📃 Usage : angry emoji fun*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}heart\`*
┋  *📃 Usage : heart emoji fun*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}happy\`*
┋  *📃 Usage : happy emoji fun*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}confused\`*
┋  *📃 Usage : confused emoji fun*
┇ 
┋ *📍 Command : \`${sessionConfig.PREFIX}moon\`*
┋  *📃 Usage : moon emoji fun*
┇ 
┋ *📍 Command : \`${sessionConfig.PREFIX}shy\`*
┋  *📃 Usage : shy emoji fun*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}sad\`*
┋  *📃 Usage : sad emoji fun*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}joke\`*
┋  *📃 Usage : joke fun command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}fact\`*
┋  *📃 Usage : fact fun command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}roll\`*
┋  *📃 Usage : roll fun command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}coin\`*
┋  *📃 Usage : coin fun command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}8ball\`*
┋  *📃 Usage : 8ball fun command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}ship\`*
┋  *📃 Usage : ship fun command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}compliment\`*
┋  *📃 Usage : compliment fun command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}roast\`*
┋  *📃 Usage : roast fun command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}choose\`*
┋  *📃 Usage : choose fun command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}rate\`*
┋  *📃 Usage : rate fun command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}quote\`*
┋  *📃 Usage : Take a Quote Type* 
┇
╰────────────────┈⊷

*🌐 DEVELOPER NEXUS  MINI BOT Website :*
> ${config.PAIR}`;

    await socket.sendMessage(sender, {
        productMessage: {
            title: "Fᴜɴ Mᴇɴᴜ 🎮",
            description: "Ｄᴛᴢ Ｍɪɴɪ Ｂᴏᴛ Fᴜɴ Cᴏᴍᴍᴀɴᴅs 📍",
            thumbnail: { url: `${sessionConfig.IMAGE}` },
            productId: "DEVELOPER NEXUS -FUN-001",
            retailerId: "DEVELOPER NEXUS -TEAM",
            url: "https://whatsapp.com/channel/0029Vb5lyTTE50UljDvt993M",
            body: message,
            footer: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ* ${sessionConfig.FOOTER}`,
            priceAmount1000: 99999999900,
            currencyCode: "LKR",
            buttons: [
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "MENU LIST CMD",
                        id: `${sessionConfig.PREFIX}menu`
                    })
                },
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "ALIVE CMD",
                        id: `${sessionConfig.PREFIX}alive`
                    })
                }
            ]
        }
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;
}

case 'groupmenu': {
    await socket.sendMessage(sender, {
        react: { text: '📍', key: msg.key }
    });

    let message = `*_${sessionConfig.NAME} Gʀᴏᴜᴘ Mᴇɴᴜ ☃️_*
╭────────────────┈⊷
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}add\`*
┋  *📃 Usage : This command use only group* 
┇ 
┋ *📍 Command : \`${sessionConfig.PREFIX}kick\`*
┋  *📃 Usage : This command use only group* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}mute\`*
┋  *📃 Usage : This command use only group* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}unmute\`*
┋  *📃 Usage : This command use only group* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}hidetag\`*
┋  *📃 Usage : This command use only group* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}tagall\`*
┋  *📃 Usage : This command use only group* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}promte\`*
┋  *📃 Usage : This command use only group* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}demote\`*
┋  *📃 Usage : This command use only group* 
┇
╰────────────────┈⊷

*🌐 DEVELOPER NEXUS  MINI BOT Website :*
> ${config.PAIR}`;

    await socket.sendMessage(sender, {
        productMessage: {
            title: "Gʀᴏᴜᴘ Mᴇɴᴜ 👥",
            description: "Ｄᴛᴢ Ｍɪɴɪ Ｂᴏᴛ Gʀᴏᴜᴘ Cᴏᴍᴍᴀɴᴅs 📍",
            thumbnail: { url: `${sessionConfig.IMAGE}` },
            productId: "DEVELOPER NEXUS -GROUP-001",
            retailerId: "DEVELOPER NEXUS -TEAM",
            url: "https://whatsapp.com/channel/0029Vb5lyTTE50UljDvt993M",
            body: message,
            footer: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ* ${sessionConfig.FOOTER}`,
            priceAmount1000: 99999999900,
            currencyCode: "LKR",
            buttons: [
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "MENU LIST CMD",
                        id: `${sessionConfig.PREFIX}menu`
                    })
                },
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "ALIVE CMD",
                        id: `${sessionConfig.PREFIX}alive`
                    })
                }
            ]
        }
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;
}

case 'searchmenu': {
    await socket.sendMessage(sender, {
        react: { text: '📍', key: msg.key }
    });

    let message = `*_${sessionConfig.NAME} Sᴇᴀʀᴄʜ Mᴇɴᴜ ☃️_*
╭────────────────┈⊷
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}yts\`*
┋  *📃 Usage : Search List Of Yts Videos* 
┇ 
┋ *📍 Command : \`${sessionConfig.PREFIX}yts2\`*
┋  *📃 Usage : Search List Of Yts Videos* 
┇ ]
┋ *📍 Command : \`${sessionConfig.PREFIX}ts / ${sessionConfig.PREFIX}tiktoksearch\`*
┋  *📃 Usage : Search List Of Tiktok Videos*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}img\`*
┋  *📃 Usage : Search List Of Image*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}Wallpaper\`*
┋  *📃 Usage : Search List Of Random Wallpaper*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}wallpaper2\`*
┋  *📃 Usage : Search List Of Wallpaper 02* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}wallpaper3\`*
┋  *📃 Usage : Search List Of Wallpaper 03* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}meme\`*
┋  *📃 Usage : Search List Of Meme* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}animerand\`*
┋  *📃 Usage : Search List Of Animerand* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}dog\`*
┋  *📃 Usage : Search List Of Dog Wallpaper* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}cat\`*
┋  *📃 Usage : Search List Of Cat Wallpaper* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}google\`*
┋  *📃 Usage : Search List Of Google* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}google2\`*
┋  *📃 Usage : Search List Of Google 02* 
┇)
┋ *📍 Command : \`${sessionConfig.PREFIX}pin / ${sessionConfig.PREFIX}pinterest\`*
┋  *📃 Usage : Search List Of Pinterest Image* 
┇
╰────────────────┈⊷

*🌐 DEVELOPER NEXUS  MINI BOT Website :*
> ${config.PAIR}`;

    await socket.sendMessage(sender, {
        productMessage: {
            title: "Sᴇᴀʀᴄʜ Mᴇɴᴜ 🔍",
            description: "Ｄᴛᴢ Ｍɪɴɪ Ｂᴏᴛ Sᴇᴀʀᴄʜ Cᴏᴍᴍᴀɴᴅs 📍",
            thumbnail: { url: `${sessionConfig.IMAGE}` },
            productId: "DEVELOPER NEXUS -SEARCH-001",
            retailerId: "DEVELOPER NEXUS -TEAM",
            url: "https://whatsapp.com/channel/0029Vb5lyTTE50UljDvt993M",
            body: message,
            footer: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ* ${sessionConfig.FOOTER}`,
            priceAmount1000: 99999999900,
            currencyCode: "LKR",
            buttons: [
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "MENU LIST CMD",
                        id: `${sessionConfig.PREFIX}menu`
                    })
                },
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "ALIVE CMD",
                        id: `${sessionConfig.PREFIX}alive`
                    })
                }
            ]
        }
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;
}

case 'ownermenu': {
    await socket.sendMessage(sender, {
        react: { text: '📍', key: msg.key }
    });

    let message = `*_${sessionConfig.NAME} Oᴡɴᴇʀ Mᴇɴᴜ ☃️_*
╭────────────────┈⊷
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}block\`*
┋  *📃 Usage : block a number* 
┇ 
┋ *📍 Command : \`${sessionConfig.PREFIX}unblock\`*
┋  *📃 Usage : unblock a number* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}leave\`*
┋  *📃 Usage : leave a group* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}join\`*
┋  *📃 Usage : join a group* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}setpp\`*
┋  *📃 Usage : set a profile picture* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}setpp2\`*
┋  *📃 Usage : set a profile picture 2* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}boom\`*
┋  *📃 Usage : Send Boom Massages*
┇ 
┋ *📍 Command : \`${sessionConfig.PREFIX}checkspam\`*
┋  *📃 Usage : check the spam* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}glink\`*
┋  *📃 Usage : get a group link* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}ginfo\`*
┋  *📃 Usage : check the group info* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}Broadchat\`*
┋  *📃 Usage : go to the group members inbox* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}forward\`*
┋  *📃 Usage : Message share other group or inbox* 
┇
╰────────────────┈⊷

*🌐 DEVELOPER NEXUS  MINI BOT Website :*
> ${config.PAIR}`;

    await socket.sendMessage(sender, {
        productMessage: {
            title: "Oᴡɴᴇʀ Mᴇɴᴜ 👑",
            description: "Ｄᴛᴢ Ｍɪɴɪ Ｂᴏᴛ Oᴡɴᴇʀ Cᴏᴍᴍᴀɴᴅs 📍",
            thumbnail: { url: `${sessionConfig.IMAGE}` },
            productId: "DEVELOPER NEXUS -OWNER-001",
            retailerId: "DEVELOPER NEXUS -TEAM",
            url: "https://whatsapp.com/channel/0029Vb5lyTTE50UljDvt993M",
            body: message,
            footer: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ* ${sessionConfig.FOOTER}`,
            priceAmount1000: 99999999900,
            currencyCode: "LKR",
            buttons: [
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "MENU LIST CMD",
                        id: `${sessionConfig.PREFIX}menu`
                    })
                },
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "ALIVE CMD",
                        id: `${sessionConfig.PREFIX}alive`
                    })
                }
            ]
        }
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;
}

case 'convertmenu': {
    await socket.sendMessage(sender, {
        react: { text: '📍', key: msg.key }
    });

    let message = `*_${sessionConfig.NAME} Cᴏɴᴠᴇʀᴛ Mᴇɴᴜ ☃️_*
╭────────────────┈⊷
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}sticker / ${sessionConfig.PREFIX}s\`*
┋  *📃 Usage : Take A Sticker* 
┇ 
┋ *📍 Command : \`${sessionConfig.PREFIX}toimg\`*
┋  *📃 Usage : Take A Image* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}tourl / ${sessionConfig.PREFIX}url\`*
┋  *📃 Usage : Take A Image Or Video Url* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}tts\`*
┋  *📃 Usage : Take A Tts Voice* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}translate\`*
┋  *📃 Usage : Translate To Language* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}qrcode\`*
┋  *📃 Usage : Take A Qrcode* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}timezone\`*
┋  *📃 Usage : Take A Time* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}readmore\`*
┋  *📃 Usage : Take A Readmore* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}reverse\`*
┋  *📃 Usage : Take A Reverse* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}styletext\`*
┋  *📃 Usage : Take A Font Style* 
┇
╰────────────────┈⊷

*🌐 DEVELOPER NEXUS  Mini Bot Website :*
> ${config.PAIR}`;

    await socket.sendMessage(sender, {
        productMessage: {
            title: "Cᴏɴᴠᴇʀᴛ Mᴇɴᴜ 🔄",
            description: `_Dᴛᴢ Mɪɴᴜ Bᴏᴛ Cᴏɴᴠᴇʀᴛ Cᴏᴍᴍᴀɴᴅs 📍`,
            thumbnail: { url: `${sessionConfig.IMAGE}` },
            productId: "DEVELOPER NEXUS -CONVERT-001",
            retailerId: "DEVELOPER NEXUS -TEAM",
            url: "https://whatsapp.com/channel/0029Vb5lyTTE50UljDvt993M",
            body: message,
            footer: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ* ${sessionConfig.FOOTER}`,
            priceAmount1000: 99999999900,
            currencyCode: "LKR",
            buttons: [
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "MENU LIST CMD",
                        id: `${sessionConfig.PREFIX}menu`
                    })
                },
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "ALIVE CMD",
                        id: `${sessionConfig.PREFIX}alive`
                    })
                }
            ]
        }
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;
}

case 'animemenu': {
    await socket.sendMessage(sender, {
        react: { text: '📍', key: msg.key }
    });

    let message = `*_${sessionConfig.NAME} Aɴɪᴍᴇ Mᴇɴᴜ ☃️_*
╭────────────────┈⊷
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}anime\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}animewallpaper\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}animegirl\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}animegirl1\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}animegirl2\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}animegirl3\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}animegirl4\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}animegirl5\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}animeimg\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}loli\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}waifu\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}niko\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}waifu2\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}niko2\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}awoo\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}megumin\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}maid\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}animeimg1\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}animeimg2\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}animeimg3\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}animeimg4\`*
┋  *📃 Usage : random anime command* 
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}animeimg5\`*
┋  *📃 Usage : random anime command* 
┇
╰────────────────┈⊷

*🌐 DEVELOPER NEXUS  MINI BOT Website :*
> ${config.PAIR}`;

    await socket.sendMessage(sender, {
        productMessage: {
            title: "Aɴɪᴍᴇ Mᴇɴᴜ 🎌",
            description: `_Dᴛᴢ Mɪɴᴜ Bᴏᴛ Aɴɪᴍᴇ Cᴏᴍᴍᴀɴᴅs 📍`,
            thumbnail: { url: `${sessionConfig.IMAGE}` },
            productId: "DEVELOPER NEXUS -ANIME-001",
            retailerId: "DEVELOPER NEXUS -TEAM",
            url: "https://whatsapp.com/channel/0029Vb5lyTTE50UljDvt993M",
            body: message,
            footer: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ* ${sessionConfig.FOOTER}`,
            priceAmount1000: 99999999900,
            currencyCode: "LKR",
            buttons: [
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "MENU LIST CMD",
                        id: `${sessionConfig.PREFIX}menu`
                    })
                },
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "ALIVE CMD",
                        id: `${sessionConfig.PREFIX}alive`
                    })
                }
            ]
        }
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;
}


case 'settingmenu': {
    await socket.sendMessage(sender, {
        react: { text: '⚙️', key: msg.key }
    });

    let message = `*_${sessionConfig.NAME} Sᴇᴛᴛɪɴɢ Mᴇɴᴜ ⚙️_*
╭────────────────┈⊷
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setname\`*
┋  *📃 Usage : setname < add your name >* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setimage\`*
┋  *📃 Usage : setimage < add your image url >* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setfooter\`*
┋  *📃 Usage : setfooter < add your footer name >* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setsong\`*
┋  *📃 Usage : setsong < add your song url>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setmode\`*
┋  *📃 Usage : setmode <public/private/inbox/groups>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setprefix\`*
┋  *📃 Usage : setprefix <prefix>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setname\`*
┋  *📃 Usage : setname <bot name>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setfooter\`*
┋  *📃 Usage : setfooter <footer text>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setimage\`*
┋  *📃 Usage : setimage <image url>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setautoreply\`*
┋  *📃 Usage : setautoreply <true/false>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setautoreplytext\`*
┋  *📃 Usage : setautoreplytext <message>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setautoai\`*
┋  *📃 Usage : setautoai <true/false>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setautoview\`*
┋  *📃 Usage : setautoview <true/false>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setautolike\`*
┋  *📃 Usage : setautolike <true/false>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setautolikeemoji\`*
┋  *📃 Usage : setautolikeemoji <emoji>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setautoread\`*
┋  *📃 Usage : setautoread <true/false>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setautotyping\`*
┋  *📃 Usage : setautotyping <true/false>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setautorecording\`*
┋  *📃 Usage : setautorecording <true/false>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setautoreact\`*
┋  *📃 Usage : setautoreact <true/false>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setautovoice\`*
┋  *📃 Usage : setautovoice <true/false>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setalwaysonline\`*
┋  *📃 Usage : setalwaysonline <true/false>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setalwaysoffline\`*
┋  *📃 Usage : setalwaysoffline <true/false>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setanticall\`*
┋  *📃 Usage : setanticall <true/false>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setantibot\`*
┋  *📃 Usage : setantibot <true/false>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setantibad\`*
┋  *📃 Usage : setantibad <true/false>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setantilink\`*
┋  *📃 Usage : setantilink <true/false>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setwelcomegoodbye\`*
┋  *📃 Usage : setwelcomegoodbye <true/false>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setreadcmdonly\`*
┋  *📃 Usage : setreadcmdonly <true/false>* 
┇
┋ *⚙️ Command : \`${sessionConfig.PREFIX}setautobio\`*
┋  *📃 Usage : setautobio <true/false>* 
┇
╰────────────────┈⊷

*🌐 DEVELOPER NEXUS  MINI BOT Website :*
> ${config.PAIR}`;

    await socket.sendMessage(sender, {
        productMessage: {
            title: "Sᴇᴛᴛɪɴɢ Mᴇɴᴜ ⚙️",
            description: `_Dᴛᴢ Mɪɴᴜ Bᴏᴛ Sᴇᴛᴛɪɴɢ Cᴏᴍᴍᴀɴᴅs ⚙️`,
            thumbnail: { url: `${sessionConfig.IMAGE}` },
            productId: "DEVELOPER NEXUS -SETTING-001",
            retailerId: "DEVELOPER NEXUS -TEAM",
            url: "https://whatsapp.com/channel/0029Vb5lyTTE50UljDvt993M",
            body: message,
            footer: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ* ${sessionConfig.FOOTER}`,
            priceAmount1000: 99999999900,
            currencyCode: "LKR",
            buttons: [
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "⚙️ SETTINGS CMD",
                        id: `${sessionConfig.PREFIX}settings`
                    })
                },
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "🏠 MAIN MENU",
                        id: `${sessionConfig.PREFIX}menu`
                    })
                }
            ]
        }
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;
}

case 'aimenu': {
    await socket.sendMessage(sender, {
        react: { text: '🤖', key: msg.key }
    });

    let message = `*_${sessionConfig.NAME} Aɪ Mᴇɴᴜ 🤖_*
╭────────────────┈⊷
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}ai\`*
┋  *📃 Usage : AI Chat* 
┇ 
┋ *📍 Command : \`${sessionConfig.PREFIX}openai\`*
┋  *📃 Usage : OpenAI ChatGPT AI Chat* 
┇ 
┋ *📍 Command : \`${sessionConfig.PREFIX}gemini\`*
┋  *📃 Usage : Google Gemini AI Chat*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}gpt3\`*
┋  *📃 Usage : GPT-3 AI Chat*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}blackbox\`*
┋  *📃 Usage : Blackbox AI Chat*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}oss\`*
┋  *📃 Usage : Open Source AI Chat*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}chatgpt\`*
┋  *📃 Usage : ChatGPT AI Chat*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}deepseek\`*
┋  *📃 Usage : DeepSeek AI Chat*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}writecream\`*
┋  *📃 Usage : Writecream AI Chat*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}askai\`*
┋  *📃 Usage : Ask AI Chat*
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}aiimg\`*
┋  *📃 Usage : AI Image Generate*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}aiimg2\`*
┋  *📃 Usage : AI Image Generate V2*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}imagine\`*
┋  *📃 Usage : Imagine AI Image*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}generate\`*
┋  *📃 Usage : Generate AI Art*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}draw\`*
┋  *📃 Usage : Draw AI Image*
┋
┋ *📍 Command : \`${sessionConfig.PREFIX}crictos\`*
┋  *📃 Usage : Crictos AI Image Generate*
┇
╰────────────────┈⊷

*🌐 DEVELOPER NEXUS  MINI BOT Website :*
> ${config.PAIR}`;

    await socket.sendMessage(sender, {
        productMessage: {
            title: "Aɪ Mᴇɴᴜ 🤖",
            description: "Ｄᴛᴢ Ｍɪɴɪ Ｂᴏᴛ Aɪ Cᴏᴍᴍᴀɴᴅs 🤖",
            thumbnail: { url: `${sessionConfig.IMAGE}` },
            productId: "DEVELOPER NEXUS -AI-001",
            retailerId: "DEVELOPER NEXUS -TEAM",
            url: "https://whatsapp.com/channel/0029Vb5lyTTE50UljDvt993M",
            body: message,
            footer: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ* ${sessionConfig.FOOTER}`,
            priceAmount1000: 99999999900,
            currencyCode: "LKR",
            buttons: [
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "MENU LIST CMD",
                        id: `${sessionConfig.PREFIX}menu`
                    })
                },
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "ALIVE CMD",
                        id: `${sessionConfig.PREFIX}alive`
                    })
                }
            ]
        }
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;
}

case 'newsmenu': {
    await socket.sendMessage(sender, {
        react: { text: '📰', key: msg.key }
    });

    let message = `*_${sessionConfig.NAME} Nᴇᴡs Mᴇɴᴜ 📰_*
╭────────────────┈⊷
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}bbcnews\`*
┋  *📃 Usage : BBC News (latest 5)*
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}bbcnews 1-10\`*
┋  *📃 Usage : BBC News (count select)*
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}slnews\`*
┋  *📃 Usage : Sri Lanka News (all sources)*
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}worldnews\`*
┋  *📃 Usage : World / International News*
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}worldnews technology\`*
┋  *📃 Usage : Technology News*
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}worldnews anime\`*
┋  *📃 Usage : Anime News*
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}worldnews south-asian\`*
┋  *📃 Usage : South Asian News*
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}worldnews sri-lankan\`*
┋  *📃 Usage : Sri Lankan News (EN)*
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}derana\`*
┋  *📃 Usage : Ada Derana latest news*
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}lankadeepa\`*
┋  *📃 Usage : Lankadeepa latest news*
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}gagana\`*
┋  *📃 Usage : Gagana latest news*
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}newsfirst\`*
┋  *📃 Usage : NewsFirst latest news*
┇
┋ *📍 Command : \`${sessionConfig.PREFIX}news\`*
┋  *📃 Usage : category news*
┇
┋ *📌 Available Categories :*
┋  • \`international\` — BBC, CNN, Al Jazeera
┋  • \`technology\` — TechCrunch, Wired
┋  • \`anime\` — ANN, Crunchyroll
┋  • \`south-asian\` — TOI, Dawn
┋  • \`sri-lankan\` — Ada Derana, Hiru
┇
┋ *📌 Sri Lanka Sources :*
┋  📺 NewsFIRST | 📺 Ada Derana
┋  📰 Lankadeepa | 📰 Gagana
┇
╰────────────────┈⊷

*🌐 DEVELOPER NEXUS  MINI BOT Website :*
> ${config.PAIR}`;

    await socket.sendMessage(sender, {
        productMessage: {
            title: "Nᴇᴡs Mᴇɴᴜ 📰",
            description: `_Dᴛᴢ Mɪɴɪ Bᴏᴛ Nᴇᴡs Cᴏᴍᴍᴀɴᴅs 📍_`,
            thumbnail: { url: `${sessionConfig.IMAGE}` },
            productId: "DEVELOPER NEXUS -NEWS-001",
            retailerId: "DEVELOPER NEXUS -TEAM",
            url: "https://whatsapp.com/channel/0029Vb5lyTTE50UljDvt993M",
            body: message,
            footer: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ* ${sessionConfig.FOOTER}`,
            priceAmount1000: 99999999900,
            currencyCode: "LKR",
            buttons: [
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "📋 MENU LIST",
                        id: `${sessionConfig.PREFIX}menu`
                    })
                },
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "📰 NEWS SITES",
                        id: `${sessionConfig.PREFIX}newslist`
                    })
                }
            ]
        }
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    break;
}
                
case 'ping': {

    await socket.sendMessage(sender, {
        react: { text: '⚡', key: msg.key }
    });

    const tempMsg = await socket.sendMessage(sender, {
        text: '*Pinging... ⚡*'
    });

    const pingMs = Date.now() - (tempMsg.messageTimestamp * 1000);

    await socket.sendMessage(sender, { delete: tempMsg.key });

    let thumbImage = null;
    
        const res = await axios.get(
            'https://i.ibb.co/PvbWmQyb/tourl-1765534366246.jpg',
            { responseType: 'arraybuffer' }
        );
        thumbImage = Buffer.from(res.data);
    
    await socket.sendMessage(
        sender,
        {
            document: {
                url: 'https://i.ibb.co/PvbWmQyb/tourl-1765534366246.jpg'
            },
            mimetype: 'image/png',
            fileName:  'DEVELOPER NEXUS -MINI-BOT.png',
            fileLength: 99999,
            pageCount: 1,
            jpegThumbnail: thumbImage,
            caption: `*Pong ${pingMs.toFixed(2)} ms ⚡*`
        },
        { quoted: DEVELOPER_NEXUS_minibot }
    );
    break;
}

//================[ ai cmd ]================
case 'ai': {
    await socket.sendMessage(sender, {
        react: {
            text: '🤖',
            key: msg.key
        }
    });

    const aiQ = msg.message?.conversation || 
                msg.message?.extendedTextMessage?.text || 
                msg.message?.imageMessage?.caption || 
                msg.message?.videoMessage?.caption || '';
    
    const aiQuery = aiQ.split(' ').slice(1).join(' ').trim();

    if (!aiQuery) {
        return await socket.sendMessage(sender, {
            text: "_Please provide a message for the AI.\nExample: `.ai Hello`_"
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    try {
        const aiApiUrl = `https://lance-frank-asta.onrender.com/api/gpt?q=${encodeURIComponent(aiQuery)}`;
        const aiResponse = await axios.get(aiApiUrl);

        if (!aiResponse.data || !aiResponse.data.message) {
            await socket.sendMessage(sender, {
                react: { text: '❌', key: msg.key }
            });
            return await socket.sendMessage(sender, {
                text: "AI failed to respond. Please try again later."
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        await socket.sendMessage(sender, {
            text: `${aiResponse.data.message}\n\n> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, {
            react: { text: '✅', key: msg.key }
        });

    } catch (err) {
        await socket.sendMessage(sender, {
            react: { text: '❌', key: msg.key }
        });
        await socket.sendMessage(sender, {
            text: "❌ *AI Error:* Failed to fetch response."
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    break;
}

case 'openai': {
    await socket.sendMessage(sender, {
        react: {
            text: '🤖',
            key: msg.key
        }
    });

    const openaiQ = msg.message?.conversation || 
                msg.message?.extendedTextMessage?.text || 
                msg.message?.imageMessage?.caption || 
                msg.message?.videoMessage?.caption || '';
    
    const openaiQuery = openaiQ.split(' ').slice(1).join(' ').trim();

    if (!openaiQuery) {
        return await socket.sendMessage(sender, {
            text: "_Please provide a message for the AI.\nExample: `.openai Hello`_"
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    try {
        const openaiApiUrl = `https://DEVELOPER NEXUS -ai-api-new.vercel.app/api/ai/openai?prompt=${encodeURIComponent(openaiQuery)}`;
        const openaiResponse = await axios.get(openaiApiUrl);

        if (!openaiResponse.data || !openaiResponse.data.data) {
            await socket.sendMessage(sender, {
                react: { text: '❌', key: msg.key }
            });
            return await socket.sendMessage(sender, {
                text: "AI failed to respond. Please try again later."
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        await socket.sendMessage(sender, {
            text: `${openaiResponse.data.data}\n\n> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, {
            react: { text: '✅', key: msg.key }
        });

    } catch (err) {
        await socket.sendMessage(sender, {
            react: { text: '❌', key: msg.key }
        });
        await socket.sendMessage(sender, {
            text: "❌ *OpenAI Error:* Failed to fetch response."
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    break;
}

case 'gemini': {
    await socket.sendMessage(sender, {
        react: {
            text: '✨',
            key: msg.key
        }
    });

    const geminiQ = msg.message?.conversation || 
                msg.message?.extendedTextMessage?.text || 
                msg.message?.imageMessage?.caption || 
                msg.message?.videoMessage?.caption || '';
    
    const geminiQuery = geminiQ.split(' ').slice(1).join(' ').trim();

    if (!geminiQuery) {
        return await socket.sendMessage(sender, {
            text: "_Please provide a message for the AI.\nExample: `.gemini Hello`_"
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    try {
        const geminiApiUrl = `https://DEVELOPER NEXUS -ai-api.vercel.app/api/ai/gemini?prompt=${encodeURIComponent(geminiQuery)}`;
        const geminiResponse = await axios.get(geminiApiUrl);

        if (!geminiResponse.data || !geminiResponse.data.data) {
            await socket.sendMessage(sender, {
                react: { text: '❌', key: msg.key }
            });
            return await socket.sendMessage(sender, {
                text: "AI failed to respond. Please try again later."
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        await socket.sendMessage(sender, {
            text: `${geminiResponse.data.data}\n\n> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, {
            react: { text: '✅', key: msg.key }
        });

    } catch (err) {
        await socket.sendMessage(sender, {
            react: { text: '❌', key: msg.key }
        });
        await socket.sendMessage(sender, {
            text: "❌ *Gemini Error:* Failed to fetch response."
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    break;
}

case 'gpt3': {
    await socket.sendMessage(sender, {
        react: {
            text: '🧠',
            key: msg.key
        }
    });

    const gpt3Q = msg.message?.conversation || 
                msg.message?.extendedTextMessage?.text || 
                msg.message?.imageMessage?.caption || 
                msg.message?.videoMessage?.caption || '';
    
    const gpt3Query = gpt3Q.split(' ').slice(1).join(' ').trim();

    if (!gpt3Query) {
        return await socket.sendMessage(sender, {
            text: "_Please provide a message for the AI.\nExample: `.gpt3 Hello`_"
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    try {
        const gpt3ApiUrl = `https://DEVELOPER NEXUS -ai-api.vercel.app/api/ai/gpt3?prompt=${encodeURIComponent(gpt3Query)}`;
        const gpt3Response = await axios.get(gpt3ApiUrl);

        if (!gpt3Response.data || !gpt3Response.data.data) {
            await socket.sendMessage(sender, {
                react: { text: '❌', key: msg.key }
            });
            return await socket.sendMessage(sender, {
                text: "AI failed to respond. Please try again later."
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        await socket.sendMessage(sender, {
            text: `${gpt3Response.data.data}\n\n> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, {
            react: { text: '✅', key: msg.key }
        });

    } catch (err) {
        await socket.sendMessage(sender, {
            react: { text: '❌', key: msg.key }
        });
        await socket.sendMessage(sender, {
            text: "❌ *GPT-3 Error:* Failed to fetch response."
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    break;
}

case 'blackbox': {
    await socket.sendMessage(sender, {
        react: {
            text: '🖤',
            key: msg.key
        }
    });

    const blackboxQ = msg.message?.conversation || 
                msg.message?.extendedTextMessage?.text || 
                msg.message?.imageMessage?.caption || 
                msg.message?.videoMessage?.caption || '';
    
    const blackboxQuery = blackboxQ.split(' ').slice(1).join(' ').trim();

    if (!blackboxQuery) {
        return await socket.sendMessage(sender, {
            text: "_Please provide a message for the AI.\nExample: `.blackbox Hello`_"
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    try {
        const blackboxApiUrl = `https://DEVELOPER NEXUS -ai-api.vercel.app/api/ai/blackbox?prompt=${encodeURIComponent(blackboxQuery)}`;
        const blackboxResponse = await axios.get(blackboxApiUrl);

        if (!blackboxResponse.data || !blackboxResponse.data.data) {
            await socket.sendMessage(sender, {
                react: { text: '❌', key: msg.key }
            });
            return await socket.sendMessage(sender, {
                text: "AI failed to respond. Please try again later."
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        await socket.sendMessage(sender, {
            text: `${blackboxResponse.data.data}\n\n> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, {
            react: { text: '✅', key: msg.key }
        });

    } catch (err) {
        await socket.sendMessage(sender, {
            react: { text: '❌', key: msg.key }
        });
        await socket.sendMessage(sender, {
            text: "❌ *Blackbox Error:* Failed to fetch response."
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    break;
}

case 'oss': {
    await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

    const ossQ = msg.message?.conversation || 
                msg.message?.extendedTextMessage?.text || 
                msg.message?.imageMessage?.caption || 
                msg.message?.videoMessage?.caption || '';
    const ossQuery = ossQ.split(' ').slice(1).join(' ').trim();

    if (!ossQuery) {
        return await socket.sendMessage(sender, {
            text: "_Please provide a message for the AI.\nExample: `.oss Hello`_"
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    try {
        const ossResponse = await axios.get(`https://DEVELOPER NEXUS -ai-api.vercel.app/api/ai/oss?prompt=${encodeURIComponent(ossQuery)}`);

        if (!ossResponse.data || !ossResponse.data.data) {
            await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
            return await socket.sendMessage(sender, {
                text: "AI failed to respond. Please try again later."
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        await socket.sendMessage(sender, {
            text: `${ossResponse.data.data}\n\n> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        await socket.sendMessage(sender, {
            text: "❌ *OSS Error:* Failed to fetch response."
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'chatgpt': {
    await socket.sendMessage(sender, { react: { text: '💬', key: msg.key } });

    const chatgptQ = msg.message?.conversation || 
                msg.message?.extendedTextMessage?.text || 
                msg.message?.imageMessage?.caption || 
                msg.message?.videoMessage?.caption || '';
    const chatgptQuery = chatgptQ.split(' ').slice(1).join(' ').trim();

    if (!chatgptQuery) {
        return await socket.sendMessage(sender, {
            text: "_Please provide a message for the AI.\nExample: `.chatgpt Hello`_"
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    try {
        const chatgptResponse = await axios.get(`https://DEVELOPER NEXUS -ai-api.vercel.app/api/ai/chatgpt?prompt=${encodeURIComponent(chatgptQuery)}`);

        if (!chatgptResponse.data || !chatgptResponse.data.data) {
            await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
            return await socket.sendMessage(sender, {
                text: "AI failed to respond. Please try again later."
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        await socket.sendMessage(sender, {
            text: `${chatgptResponse.data.data}\n\n> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        await socket.sendMessage(sender, {
            text: "❌ *ChatGPT Error:* Failed to fetch response."
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'deepseek': {
    await socket.sendMessage(sender, { react: { text: '🔬', key: msg.key } });

    const deepseekQ = msg.message?.conversation || 
                msg.message?.extendedTextMessage?.text || 
                msg.message?.imageMessage?.caption || 
                msg.message?.videoMessage?.caption || '';
    const deepseekQuery = deepseekQ.split(' ').slice(1).join(' ').trim();

    if (!deepseekQuery) {
        return await socket.sendMessage(sender, {
            text: "_Please provide a message for the AI.\nExample: `.deepseek Hello`_"
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    try {
        const deepseekResponse = await axios.get(`https://DEVELOPER NEXUS -ai-api.vercel.app/api/ai/deepseek?prompt=${encodeURIComponent(deepseekQuery)}`);

        if (!deepseekResponse.data || !deepseekResponse.data.data) {
            await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
            return await socket.sendMessage(sender, {
                text: "AI failed to respond. Please try again later."
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        await socket.sendMessage(sender, {
            text: `${deepseekResponse.data.data}\n\n> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        await socket.sendMessage(sender, {
            text: "❌ *DeepSeek Error:* Failed to fetch response."
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'writecream': {
    await socket.sendMessage(sender, { react: { text: '✍️', key: msg.key } });

    const writecreamQ = msg.message?.conversation || 
                msg.message?.extendedTextMessage?.text || 
                msg.message?.imageMessage?.caption || 
                msg.message?.videoMessage?.caption || '';
    const writecreamQuery = writecreamQ.split(' ').slice(1).join(' ').trim();

    if (!writecreamQuery) {
        return await socket.sendMessage(sender, {
            text: "_Please provide a message for the AI.\nExample: `.writecream Hello`_"
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    try {
        const writecreamResponse = await axios.get(`https://api-main-xi.vercel.app/api/ai/writecream?prompt=${encodeURIComponent(writecreamQuery)}`);

        if (!writecreamResponse.data || !writecreamResponse.data.data) {
            await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
            return await socket.sendMessage(sender, {
                text: "AI failed to respond. Please try again later."
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        await socket.sendMessage(sender, {
            text: `${writecreamResponse.data.data}\n\n> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        await socket.sendMessage(sender, {
            text: "❌ *Writecream Error:* Failed to fetch response."
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'askai': {
    await socket.sendMessage(sender, { react: { text: '💡', key: msg.key } });

    const askaiQ = msg.message?.conversation || 
                msg.message?.extendedTextMessage?.text || 
                msg.message?.imageMessage?.caption || 
                msg.message?.videoMessage?.caption || '';
    const askaiQuery = askaiQ.split(' ').slice(1).join(' ').trim();

    if (!askaiQuery) {
        return await socket.sendMessage(sender, {
            text: "_Please provide a message for the AI.\nExample: `.askai Hello`_"
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    try {
        const askaiResponse = await axios.get(`https://api-main-xi.vercel.app/api/ai/askai?prompt=${encodeURIComponent(askaiQuery)}`);

        if (!askaiResponse.data || !askaiResponse.data.data) {
            await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
            return await socket.sendMessage(sender, {
                text: "AI failed to respond. Please try again later."
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        await socket.sendMessage(sender, {
            text: `${askaiResponse.data.data}\n\n> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        await socket.sendMessage(sender, {
            text: "❌ *AskAI Error:* Failed to fetch response."
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

// =========== AI img cmd ====================

case 'crictos': {
    await socket.sendMessage(sender, { react: { text: '🖼️', key: msg.key } });

    const crrictosQ = msg.message?.conversation || 
                msg.message?.extendedTextMessage?.text || 
                msg.message?.imageMessage?.caption || 
                msg.message?.videoMessage?.caption || '';
    const crrictosQuery = crrictosQ.split(' ').slice(1).join(' ').trim();

    if (!crrictosQuery) {
        return await socket.sendMessage(sender, {
            text: "_Please provide a prompt to generate an image.\nExample: `.crictos a beautiful sunset over the ocean`_"
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    try {
        const crrictosApiUrl = `https://api-main-xi.vercel.app/api/img/crictos?prompt=${encodeURIComponent(crrictosQuery)}`;
        const crrictosResponse = await axios.get(crrictosApiUrl, { responseType: 'arraybuffer' });

        if (!crrictosResponse.data) {
            await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
            return await socket.sendMessage(sender, {
                text: "❌ Failed to generate image. Please try again."
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        const crrictosBuffer = Buffer.from(crrictosResponse.data);

        await socket.sendMessage(sender, {
            image: crrictosBuffer,
            caption: `🖼️ *AI Generated Image*\n\n` +
                     `▸ *Prompt:* ${crrictosQuery}\n\n` +
                     `> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        await socket.sendMessage(sender, {
            text: "❌ *Crictos Error:* Failed to generate image."
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}


case 'aiimg': {
    await socket.sendMessage(sender, { react: { text: '🎨', key: msg.key } });

    const aiimgQ = msg.message?.conversation || 
                msg.message?.extendedTextMessage?.text || 
                msg.message?.imageMessage?.caption || 
                msg.message?.videoMessage?.caption || '';
    const aiimgArgs = aiimgQ.split(' ').slice(1).join(' ').trim();

    if (!aiimgArgs) {
        return await socket.sendMessage(sender, {
            text: `_Please provide a prompt.\nExample usage:_\n\n` +
                  `▸ \`.aiimg cat\`\n` +
                  `▸ \`.aiimg cat | size:1:1\`\n` +
                  `▸ \`.aiimg warrior | style:anime\`\n` +
                  `▸ \`.aiimg city | size:2:3 | style:cyberpunk\`\n\n` +
                  `*📐 Sizes:* 3:2, 1:1, 2:3, 16:9, 9:16\n` +
                  `*🎨 Styles:* default, ghibli, cyberpunk, anime, portrait, chibi, pixel art, oil painting, 3d, realistic, fantasy, cartoon`
        }, { quoted: DEVELOPER_NEXUS_minibot});
    }

    let aiimgPrompt = aiimgArgs;
    let aiimgSize = '';
    let aiimgStyle = '';

    const aiimgParts = aiimgArgs.split('|').map(p => p.trim());
    aiimgPrompt = aiimgParts[0].trim();

    for (let i = 1; i < aiimgParts.length; i++) {
        if (aiimgParts[i].startsWith('size:')) {
            aiimgSize = aiimgParts[i].replace('size:', '').trim();
        } else if (aiimgParts[i].startsWith('style:')) {
            aiimgStyle = aiimgParts[i].replace('style:', '').trim();
        }
    }

    try {
        let aiimgApiUrl = `https://DEVELOPER NEXUS -ai-api.vercel.app/api/ai/ai-image?prompt=${encodeURIComponent(aiimgPrompt)}`;
        if (aiimgSize) aiimgApiUrl += `&size=${encodeURIComponent(aiimgSize)}`;
        if (aiimgStyle) aiimgApiUrl += `&style=${encodeURIComponent(aiimgStyle)}`;

        const aiimgResponse = await axios.get(aiimgApiUrl, { responseType: 'arraybuffer' });

        if (!aiimgResponse.data) {
            await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
            return await socket.sendMessage(sender, {
                text: "❌ Failed to generate image. Please try again."
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        const aiimgBuffer = Buffer.from(aiimgResponse.data);

        await socket.sendMessage(sender, {
            image: aiimgBuffer,
            caption: `🎨 *AI Generated Image*\n\n` +
                     `▸ *Prompt:* ${aiimgPrompt}\n` +
                     (aiimgSize ? `▸ *Size:* ${aiimgSize}\n` : '') +
                     (aiimgStyle ? `▸ *Style:* ${aiimgStyle}\n` : '') +
                     `\n> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        await socket.sendMessage(sender, {
            text: "❌ *AI Image Error:* Failed to generate image."
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'aiimg2':
case 'imagine':
case 'generate':
case 'draw': {
    await socket.sendMessage(sender, { react: { text: '🎨', key: msg.key } });

    const aiimgQ = msg.message?.conversation || 
                msg.message?.extendedTextMessage?.text || 
                msg.message?.imageMessage?.caption || 
                msg.message?.videoMessage?.caption || '';

    const cmdUsed = aiimgQ.split(' ')[0].replace(/[^a-zA-Z]/g, '').toLowerCase();
    const aiimgArgs = aiimgQ.split(' ').slice(1).join(' ').trim();

    if (!aiimgArgs) {
        return await socket.sendMessage(sender, {
            text: `🎨 *AI Image Generator*\n\n` +
                  `*Commands:* .aiimg | .imagine | .generate | .draw\n\n` +
                  `*Usage:*\n` +
                  `▸ \`.aiimg cat\`\n` +
                  `▸ \`.imagine cat | size:1:1\`\n` +
                  `▸ \`.generate warrior | style:anime\`\n` +
                  `▸ \`.draw city | size:2:3 | style:cyberpunk\`\n\n` +
                  `*📐 Sizes:*\n` +
                  `▸ 3:2 (Default) | 1:1 | 2:3 | 16:9 | 9:16\n\n` +
                  `*🎨 Styles:*\n` +
                  `▸ default | ghibli | cyberpunk | anime\n` +
                  `▸ portrait | chibi | pixel art | oil painting\n` +
                  `▸ 3d (Default) | realistic | fantasy | cartoon`
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    let aiimgPrompt = aiimgArgs;
    let aiimgSize = '3:2'; 
    let aiimgStyle = '3d'; 

    const aiimgParts = aiimgArgs.split('|').map(p => p.trim());
    aiimgPrompt = aiimgParts[0].trim();

    for (let i = 1; i < aiimgParts.length; i++) {
        if (aiimgParts[i].toLowerCase().startsWith('size:')) {
            aiimgSize = aiimgParts[i].replace(/size:/i, '').trim();
        } else if (aiimgParts[i].toLowerCase().startsWith('style:')) {
            aiimgStyle = aiimgParts[i].replace(/style:/i, '').trim().toLowerCase();
        }
    }

    const validSizes = ['1:1', '3:2', '2:3', '16:9', '9:16'];
    if (!validSizes.includes(aiimgSize)) {
        return await socket.sendMessage(sender, {
            text: `❌ *Invalid Size!*\nAvailable sizes: ${validSizes.join(', ')}`
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    const validStyles = ['default', 'ghibli', 'cyberpunk', 'anime', 'portrait', 'chibi', 'pixel art', 'oil painting', '3d', 'realistic', 'fantasy', 'cartoon'];
    if (!validStyles.includes(aiimgStyle)) {
        return await socket.sendMessage(sender, {
            text: `❌ *Invalid Style!*\nAvailable styles: ${validStyles.join(', ')}`
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    try {
        let aiimgApiUrl = `https://DEVELOPER NEXUS -ai-api.vercel.app/api/ai/ai-image?prompt=${encodeURIComponent(aiimgPrompt)}&size=${encodeURIComponent(aiimgSize)}&style=${encodeURIComponent(aiimgStyle)}`;

        const aiimgResponse = await axios.get(aiimgApiUrl, { 
            responseType: 'arraybuffer',
            timeout: 60000
        });

        if (!aiimgResponse.data) {
            await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
            return await socket.sendMessage(sender, {
                text: "❌ Failed to generate image. Please try again."
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        const aiimgBuffer = Buffer.from(aiimgResponse.data);

        await socket.sendMessage(sender, {
            image: aiimgBuffer,
            caption: `🎨 *AI Generated Image*\n\n` +
                     `▸ *Prompt:* ${aiimgPrompt}\n` +
                     `▸ *Size:* ${aiimgSize}\n` +
                     `▸ *Style:* ${aiimgStyle}\n` +
                     `▸ *Command:* .${cmdUsed}\n\n` +
                     `> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        await socket.sendMessage(sender, {
            text: `❌ *AI Image Error:* ${err.message || 'Failed to generate image.'}`
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

//================[ ai cmd end ]================
case 'ashuu':
case 'ashuu02': {
    if (!sender.endsWith("120363420405260015@newsletter")) {
        return socket.sendMessage(sender, {
            text: `*• ඔයාට \`DEVELOPER NEXUS  Mini Bot\` වැඩ කරන්නෙ නැහැ ‼️*\n*• Bot ව ඔයාගෙ Number එකට Connect කරගන්න ඕනිනම් ✅*\n\n> Our Bot Is Not Working For You ‼️\n> If You Connect To Our Bot ✅\n\n_*.pair <ඔයාගේ නම්බර් එක>*_\n> _*.pair <Your Number>*_\n\n*⭕ Example -: .pair 94xxxxxxxxx*\n\n> *© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ*`
        }, {
            quoted: DEVELOPER_NEXUS_minibot
        });
    }

    if (!args || !args[0]) {
        return socket.sendMessage(sender, {
            text: '❗ Please provide a channel JID.\n\n*Example:*\n`.ashuu 120363420405260015@newsletter`'
        }, {
            quoted: DEVELOPER_NEXUS_minibot
        });
    }

    if (!args[0].endsWith("120363420405260015@newsletter")) {
        return socket.sendMessage(sender, {
            text: '❗ Invalid JID. Please provide a JID ending with `@newsletter`\n\n*Example:*\n`.ashuu 120363420405260015@newsletter`'
        }, {
            quoted: DEVELOPER_NEXUS_minibot
        });
    }

    try {
        const channelJid = args[0];

        let isFollowing = false;
        try {
            const metadata = await socket.newsletterMetadata("jid", channelJid);
            if (metadata?.viewer_metadata?.role) {
                isFollowing = true;
            }
        } catch (err) {
            console.log('Newsletter not followed yet or metadata fetch failed');
        }

        if (!isFollowing) {
            try {
                await socket.newsletterFollow(channelJid);
            } catch (followError) {
                console.error('Newsletter follow error:', followError);
                await socket.sendMessage(sender, {
                    text: `❌ Failed to follow newsletter.\n\n*Error:* ${followError.message || 'Unknown error'}\n\nPlease check if the JID is correct.`
                }, {
                    quoted: DEVELOPER_NEXUS_minibot
                });
            }
        }

    } catch (error) {
        console.error('Ashuu command error:', error);
        await socket.sendMessage(sender, {
            text: `❌ An error occurred while processing the request.\n\n*Error:* ${error.message || 'Unknown error'}`
        }, {
            quoted: DEVELOPER_NEXUS_minibot
        });
    }
    break;
}

                case 'xdchr': {
                    if (!sender.endsWith("120363420405260015@newsletter")) {
                        return socket.sendMessage(sender, {
                            text: `*• ඔයාට \`DEVELOPER NEXUS  Mini Bot\` වැඩ කරන්නෙ නැහැ ‼️*\n*• Bot ව ඔයාගෙ Number එකට Connect කරගන්න ඕනිනම් ✅*\n\n> Our Bot Is Not Working For You ‼️\n> If You Connect To Our Bot ✅\n\n_*.pair <ඔයාගේ නම්බර් එක*_\n> _*.pair <Your Number>*_\n\n*⭕ Example -: .pair 94xxxxxxxxx*\n\n> *© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ*`
                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });
                    }

                    const parts = body.trim().split(',')[0].trim().split('/');
                    const channelId = parts[4];
                    const messageId = parts[5];

                    if (!channelId || !messageId) {
                        return socket.sendMessage(sender, {
                            text: "✍️ Usage: .cnras <channel_message_link>\n\nExample:\n.cnras https://whatsapp.com/channel/1234/5678"
                        });
                    }

                    const res = await socket.newsletterMetadata("invite", channelId);
                    const emojis = ['🩷', '❤️', '🧡', '💛', '💚', '🩵', '💙', '💜', '🖤', '🤍'];
                    await socket.newsletterReactMessage(res.id, messageId, emojis[Math.floor(Math.random() * 7)]);

                    break;
                }
                case 'xdchr1': {
                    if (!sender.endsWith("120363420405260015@newsletter")) {
                        return socket.sendMessage(sender, {
                            text: `*• ඔයාට \`DEVELOPER NEXUS  Mini Bot\` වැඩ කරන්නෙ නැහැ ‼️*\n*• Bot ව ඔයාගෙ Number එකට Connect කරගන්න ඕනිනම් ✅*\n\n> Our Bot Is Not Working For You ‼️\n> If You Connect To Our Bot ✅\n\n_*.pair <ඔයාගේ නම්බර් එක*_\n> _*.pair <Your Number>*_\n\n*⭕ Example -: .pair 94xxxxxxxxx*\n\n> *© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ*`
                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });
                    }

                    const parts = body.trim().split(',')[0].trim().split('/');
                    const channelId = parts[4];
                    const messageId = parts[5];

                    if (!channelId || !messageId) {
                        return socket.sendMessage(sender, {
                            text: "✍️ Usage: .cnras <channel_message_link>\n\nExample:\n.cnras https://whatsapp.com/channel/1234/5678"
                        });
                    }

                    const res = await socket.newsletterMetadata("invite", channelId);
                    const emojis = ['😀', '😆', '🥹', '😂', '😅', '🤣', '😺', '😸', '😹', '🫨'];
                    await socket.newsletterReactMessage(res.id, messageId, emojis[Math.floor(Math.random() * 7)]);

                    break;
                }
                case 'xdchr2': {
                    if (!sender.endsWith("120363420405260015@newsletter")) {
                        return socket.sendMessage(sender, {
                            text: `*• ඔයාට \`DEVELOPER NEXUS  Mini Bot\` වැඩ කරන්නෙ නැහැ ‼️*\n*• Bot ව ඔයාගෙ Number එකට Connect කරගන්න ඕනිනම් ✅*\n\n> Our Bot Is Not Working For You ‼️\n> If You Connect To Our Bot ✅\n\n_*.pair <ඔයාගේ නම්බර් එක*_\n> _*.pair <Your Number>*_\n\n*⭕ Example -: .pair 94xxxxxxxxx*\n\n> *© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ*`
                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });
                    }

                    const parts = body.trim().split(',')[0].trim().split('/');
                    const channelId = parts[4];
                    const messageId = parts[5];

                    if (!channelId || !messageId) {
                        return socket.sendMessage(sender, {
                            text: "✍️ Usage: .cnras <channel_message_link>\n\nExample:\n.cnras https://whatsapp.com/channel/1234/5678"
                        });
                    }

                    const res = await socket.newsletterMetadata("invite", channelId);
                    const emojis = ['💐', '🌷', '🌹', '🥀', '🪻', '🪷', '🌺', '🌸', '🌼', '🌻'];
                    await socket.newsletterReactMessage(res.id, messageId, emojis[Math.floor(Math.random() * 7)]);

                    break;
                }
                case 'xdchr3': {
                    if (!sender.endsWith("120363420405260015@newsletter")) {
                        return socket.sendMessage(sender, {
                            text: `*• ඔයාට \`DEVELOPER NEXUS  Mini Bot\` වැඩ කරන්නෙ නැහැ ‼️*\n*• Bot ව ඔයාගෙ Number එකට Connect කරගන්න ඕනිනම් ✅*\n\n> Our Bot Is Not Working For You ‼️\n> If You Connect To Our Bot ✅\n\n_*.pair <ඔයාගේ නම්බර් එක*_\n> _*.pair <Your Number>*_\n\n*⭕ Example -: .pair 94xxxxxxxxx*\n\n> *© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ*`
                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });
                    }

                    const parts = body.trim().split(',')[0].trim().split('/');
                    const channelId = parts[4];
                    const messageId = parts[5];

                    if (!channelId || !messageId) {
                        return socket.sendMessage(sender, {
                            text: "✍️ Usage: .cnras <channel_message_link>\n\nExample:\n.cnras https://whatsapp.com/channel/1234/5678"
                        });
                    }

                    const res = await socket.newsletterMetadata("invite", channelId);
                    const emojis = ['💖', '😘', '😍', '🥰', '💞', '❤', '😻', '✨', '🌸', '💐'];
                    await socket.newsletterReactMessage(res.id, messageId, emojis[Math.floor(Math.random() * 7)]);

                    break;
                }
                case 'xdchr4': {
                    if (!sender.endsWith("120363420405260015@newsletter")) {
                        return socket.sendMessage(sender, {
                            text: `*• ඔයාට \`DEVELOPER NEXUS  Mini Bot\` වැඩ කරන්නෙ නැහැ ‼️*\n*• Bot ව ඔයාගෙ Number එකට Connect කරගන්න ඕනිනම් ✅*\n\n> Our Bot Is Not Working For You ‼️\n> If You Connect To Our Bot ✅\n\n_*.pair <ඔයාගේ නම්බර් එක*_\n> _*.pair <Your Number>*_\n\n*⭕ Example -: .pair 94xxxxxxxxx*\n\n> *© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ*`
                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });
                    }

                    const parts = body.trim().split(',')[0].trim().split('/');
                    const channelId = parts[4];
                    const messageId = parts[5];

                    if (!channelId || !messageId) {
                        return socket.sendMessage(sender, {
                            text: "✍️ Usage: .cnras <channel_message_link>\n\nExample:\n.cnras https://whatsapp.com/channel/1234/5678"
                        });
                    }

                    const res = await socket.newsletterMetadata("invite", channelId);
                    const emojis = ['❤️', '✨', '⛅', '🌷', '🌾', '💧', '☃️', '🍭', '🫐', '🍉'];
                    await socket.newsletterReactMessage(res.id, messageId, emojis[Math.floor(Math.random() * 7)]);

                    break;
                }
                case 'xdchr5': {
                    if (!sender.endsWith("120363420405260015@newsletter")) {
                        return socket.sendMessage(sender, {
                            text: `*• ඔයාට \`DEVELOPER NEXUS  Mini Bot\` වැඩ කරන්නෙ නැහැ ‼️*\n*• Bot ව ඔයාගෙ Number එකට Connect කරගන්න ඕනිනම් ✅*\n\n> Our Bot Is Not Working For You ‼️\n> If You Connect To Our Bot ✅\n\n_*.pair <ඔයාගේ නම්බර් එක*_\n> _*.pair <Your Number>*_\n\n*⭕ Example -: .pair 94xxxxxxxxx*\n\n> *© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ*`
                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                    }

                    const parts = body.trim().split(',')[0].trim().split('/');
                    const channelId = parts[4];
                    const messageId = parts[5];

                    if (!channelId || !messageId) {
                        return socket.sendMessage(sender, {
                            text: "✍️ Usage: .cnras <channel_message_link>\n\nExample:\n.cnras https://whatsapp.com/channel/1234/5678"
                        });
                    }

                    const res = await socket.newsletterMetadata("invite", channelId);
                    const emojis = ['😽', '😊', '💝', '🇰🇷', '🥰', '✈️', '🫰', '🎀', '😻', '😩'];
                    await socket.newsletterReactMessage(res.id, messageId, emojis[Math.floor(Math.random() * 7)]);

                    break;
                }
                case 'xdchr6': {
                    if (!sender.endsWith("120363420405260015@newsletter")) {
                        return socket.sendMessage(sender, {
                            text: `*• ඔයාට \`DEVELOPER NEXUS  Mini Bot\` වැඩ කරන්නෙ නැහැ ‼️*\n*• Bot ව ඔයාගෙ Number එකට Connect කරගන්න ඕනිනම් ✅*\n\n> Our Bot Is Not Working For You ‼️\n> If You Connect To Our Bot ✅\n\n_*.pair <ඔයාගේ නම්බර් එක*_\n> _*.pair <Your Number>*_\n\n*⭕ Example -: .pair 94xxxxxxxxx*\n\n> *© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ*`
                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });
                    }

                    const parts = body.trim().split(',')[0].trim().split('/');
                    const channelId = parts[4];
                    const messageId = parts[5];

                    if (!channelId || !messageId) {
                        return socket.sendMessage(sender, {
                            text: "✍️ Usage: .cnras <channel_message_link>\n\nExample:\n.cnras https://whatsapp.com/channel/1234/5678"
                        });
                    }

                    const res = await socket.newsletterMetadata("invite", channelId);
                    const emojis = ['🥹', '💗', '😒', '💝', '😊', '🥰', '🤭', '🫣', '💗', '🥵'];
                    await socket.newsletterReactMessage(res.id, messageId, emojis[Math.floor(Math.random() * 7)]);

                    break;
                }
                case 'xdchr7': {
                    if (!sender.endsWith("120363420405260015@newsletter")) {
                        return socket.sendMessage(sender, {
                            text: `*• ඔයාට \`DEVELOPER NEXUS  Mini Bot\` වැඩ කරන්නෙ නැහැ ‼️*\n*• Bot ව ඔයාගෙ Number එකට Connect කරගන්න ඕනිනම් ✅*\n\n> Our Bot Is Not Working For You ‼️\n> If You Connect To Our Bot ✅\n\n_*.pair <ඔයාගේ නම්බර් එක*_\n> _*.pair <Your Number>*_\n\n*⭕ Example -: .pair 94xxxxxxxxx*\n\n> *© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ*`
                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });
                    }

                    const parts = body.trim().split(',')[0].trim().split('/');
                    const channelId = parts[4];
                    const messageId = parts[5];

                    if (!channelId || !messageId) {
                        return socket.sendMessage(sender, {
                            text: "✍️ Usage: .cnras <channel_message_link>\n\nExample:\n.cnras https://whatsapp.com/channel/1234/5678"
                        });
                    }

                    const res = await socket.newsletterMetadata("invite", channelId);
                    const emojis = ['😊', '💝', '🥺', '🙂', '😽', '😭', '💕', '😓', '🥲', '😂'];
                    await socket.newsletterReactMessage(res.id, messageId, emojis[Math.floor(Math.random() * 7)]);

                    break;
                }
                case 'xdchr8': {
                    if (!sender.endsWith("120363420405260015@newsletter")) {
                        return socket.sendMessage(sender, {
                            text: `*• ඔයාට \`DEVELOPER NEXUS  Mini Bot\` වැඩ කරන්නෙ නැහැ ‼️*\n*• Bot ව ඔයාගෙ Number එකට Connect කරගන්න ඕනිනම් ✅*\n\n> Our Bot Is Not Working For You ‼️\n> If You Connect To Our Bot ✅\n\n_*.pair <ඔයාගේ නම්බර් එක*_\n> _*.pair <Your Number>*_\n\n*⭕ Example -: .pair 94xxxxxxxxx*\n\n> *© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ*`
                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });
                    }

                    const parts = body.trim().split(',')[0].trim().split('/');
                    const channelId = parts[4];
                    const messageId = parts[5];

                    if (!channelId || !messageId) {
                        return socket.sendMessage(sender, {
                            text: "✍️ Usage: .cnras <channel_message_link>\n\nExample:\n.cnras https://whatsapp.com/channel/1234/5678"
                        });
                    }

                    const res = await socket.newsletterMetadata("invite", channelId);
                    const emojis = ['🥵', '💋', '🤍', '🖤', '😻', '🌝', '🧸', '🤤', '🍇', '🍓'];
                    await socket.newsletterReactMessage(res.id, messageId, emojis[Math.floor(Math.random() * 7)]);

                    break;
                }
                case 'xdchr9': {
                    if (!sender.endsWith("120363420405260015@newsletter")) {
                        return socket.sendMessage(sender, {
                            text: `*• ඔයාට \`DEVELOPER NEXUS  Mini Bot\` වැඩ කරන්නෙ නැහැ ‼️*\n*• Bot ව ඔයාගෙ Number එකට Connect කරගන්න ඕනිනම් ✅*\n\n> Our Bot Is Not Working For You ‼️\n> If You Connect To Our Bot ✅\n\n_*.pair <ඔයාගේ නම්බර් එක*_\n> _*.pair <Your Number>*_\n\n*⭕ Example -: .pair 94xxxxxxxxx*\n\n> *© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ*`
                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });
                    }

                    const parts = body.trim().split(',')[0].trim().split('/');
                    const channelId = parts[4];
                    const messageId = parts[5];

                    if (!channelId || !messageId) {
                        return socket.sendMessage(sender, {
                            text: "✍️ Usage: .cnras <channel_message_link>\n\nExample:\n.cnras https://whatsapp.com/channel/1234/5678"
                        });
                    }

                    const res = await socket.newsletterMetadata("invite", channelId);
                    const emojis = ['😂', '🤣', '😹', '🤭', '😅', '🥹', '🤪', '😆', '😝', '🫠'];
                    await socket.newsletterReactMessage(res.id, messageId, emojis[Math.floor(Math.random() * 7)]);

                    break;
                }
                case 'xdchr10': {
                    if (!sender.endsWith("120363420405260015@newsletter")) {
                        return socket.sendMessage(sender, {
                            text: `*• ඔයාට \`DEVELOPER NEXUS  Mini Bot\` වැඩ කරන්නෙ නැහැ ‼️*\n*• Bot ව ඔයාගෙ Number එකට Connect කරගන්න ඕනිනම් ✅*\n\n> Our Bot Is Not Working For You ‼️\n> If You Connect To Our Bot ✅\n\n_*.pair <ඔයාගේ නම්බර් එක*_\n> _*.pair <Your Number>*_\n\n*⭕ Example -: .pair 94xxxxxxxxx*\n\n> *© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ*`
                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });
                    }

                    const parts = body.trim().split(',')[0].trim().split('/');
                    const channelId = parts[4];
                    const messageId = parts[5];

                    if (!channelId || !messageId) {
                        return socket.sendMessage(sender, {
                            text: "✍️ Usage: .cnras <channel_message_link>\n\nExample:\n.cnras https://whatsapp.com/channel/1234/5678"
                        });
                    }

                    const res = await socket.newsletterMetadata("invite", channelId);
                    const emojis = ['🎀', '🍻', '🌑', '🧼', '🪨', '☕', '☁'];
                    await socket.newsletterReactMessage(res.id, messageId, emojis[Math.floor(Math.random() * 7)]);

                    break;
                }

                case 'chr': {
                    const q = body.trim();

                    try {
                        let link = q.split(",")[0];
                        const channelId = link.split('/')[4];
                        const messageId = link.split('/')[5];
                        let react = q.split(",")[1]?.trim();

                        if (!channelId || !messageId || !react) {
                            return await socket.sendMessage(sender, {
                                text: "✍️ Please provide a link and emoji like:\n.cnr <link>,<💗>"
                            });
                        }

                        const res = await socket.newsletterMetadata("invite", channelId);
                        await socket.newsletterReactMessage(res.id, messageId, react);

                    } catch (e) {
                        console.log(e);
                        await socket.sendMessage(sender, {
                            text: `❌ Error: ${e.toString()}`
                        });
                    }

                    break;
                }
                
case 'freebot':
case 'pair': {
    const q = msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption || '';

    const number = q.replace(/^[.\/!](freebot|pair)\s*/i, '').trim();

    if (!number) {
        return await socket.sendMessage(sender, {
            text: '*📃 Usage:* .pair +9476XXX or .freebot +9476XXX'
        }, {
            quoted: DEVELOPER_NEXUS_minibot
        });
    }

    try {
        await socket.sendMessage(sender, {
            text: `*⏳ Processing pairing request...*\n\n*📱 Number:* ${number}\n\n*Please wait...*`
        }, {
            quoted: DEVELOPER_NEXUS_minibot
        });

        const mockRes = {
            headersSent: false,
            codeData: null,
            send: function(data) {
                this.codeData = data;
                this.headersSent = true;
            },
            status: function(code) {
                return this;
            }
        };

        await EmpirePair(number, mockRes);

        await new Promise(resolve => setTimeout(resolve, 3000));

        if (mockRes.codeData && mockRes.codeData.code) {
            const pairingCode = mockRes.codeData.code;

            await socket.sendMessage(sender, {
                text: `*ᴅᴛᴢ ᴍɪɴɪ ʙᴏᴛ v3 ᴘᴀɪʀ ᴄᴏɴɴᴇᴄᴛᴇᴅ* ✅\n\n*🔑 ʏᴏᴜʀ ᴘᴀɪʀɪɴɢ ᴄᴏᴅᴇ :* ${pairingCode}\n\n*📱 ɴᴜᴍʙᴇʀ :* ${number}\n\n\`ʜᴏᴡ ᴛᴏ ᴜꜱᴇ:\`\n\n*1. WhatsApp → Settings*\n*2. Linked Devices*\n*3. Link with Phone Number*\n*4. Enter code above ⬆️*\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
            }, {
                quoted: DEVELOPER_NEXUS_minibot
            });

            await new Promise(resolve => setTimeout(resolve, 2000));

            await socket.sendMessage(sender, {
                text: `${pairingCode}`
            }, {
                quoted: DEVELOPER_NEXUS_minibot
            });

        } else {
            throw new Error('Failed to generate pairing code');
        }

    } catch (err) {
        console.error("❌ Pair Command Error:", err);
        await socket.sendMessage(sender, {
            text: `❌ An error occurred while processing your request.\n\n*Error:* ${err.message}\n\nPlease try again later.`
        }, {
            quoted: DEVELOPER_NEXUS_minibot
        });
    }
    break;
}
                
                case 'jid':
                    reply(sender)
                    break
                case "save":
                case "sv":
                case "autostatus":
                case "sav":
                case "එවන්න":
                case 'send':

                    if (!msg.message.extendedTextMessage?.contextInfo?.quotedMessage) {
                        await socket.sendMessage(sender, {
                            image: {
                                url: sessionConfig.DEVELOPER_NEXUS_MINI_BOT_IMAGE || config.DEVELOPER_NEXUS_MINI_BOT_IMAGE
                            },
                            caption: formatMessage(
                                '❌ ERROR',
                                '*🍁 Please reply to a message!*',
                                `© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
                            )
                        });
                        break;
                    }

                    try {
                        const quotedMessage = msg.message.extendedTextMessage.contextInfo.quotedMessage;
                        const mtype = Object.keys(quotedMessage)[0];
                        const stream = await downloadContentFromMessage(quotedMessage[mtype], mtype.replace('Message', ''));
                        const chunks = [];
                        for await (const chunk of stream) {
                            chunks.push(chunk);
                        }
                        const buffer = Buffer.concat(chunks);

                        let messageContent = {};
                        switch (mtype) {
                            case 'imageMessage':
                                messageContent = {
                                    image: buffer,
                                    caption: quotedMessage.imageMessage?.caption || '',
                                    mimetype: quotedMessage.imageMessage?.mimetype || 'image/jpeg'
                                };
                                break;
                            case 'videoMessage':
                                messageContent = {
                                    video: buffer,
                                    caption: quotedMessage.videoMessage?.caption || '',
                                    mimetype: quotedMessage.videoMessage?.mimetype || 'video/mp4'
                                };
                                break;
                            case 'audioMessage':
                                messageContent = {
                                    audio: buffer,
                                    mimetype: quotedMessage.audioMessage?.mimetype || 'audio/mp4',
                                    ptt: quotedMessage.audioMessage?.ptt || false
                                };
                                break;
                            default:
                                await socket.sendMessage(sender, {
                                    image: {
                                        url: sessionConfig.DEVELOPER_NEXUS_MINI_BOT_IMAGE || config.DEVELOPER_NEXUS_MINI_BOT_IMAGE
                                    },
                                    caption: formatMessage(
                                        '❌ ERROR',
                                        'Only image, video, and audio messages are supported',
                                        `© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
                                    )
                                });
                                return;
                        }

                        await socket.sendMessage(sender, messageContent, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });

                    } catch (error) {

                        await socket.sendMessage(sender, {
                            image: {
                                url: sessionConfig.DEVELOPER_NEXUS_MINI_BOT_IMAGE || config.DEVELOPER_NEXUS_MINI_BOT_IMAGE
                            },
                            caption: formatMessage(
                                '❌ ERROR',
                                `Error forwarding message: ${error.message}`,
                                `© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
                            )
                        });
                    }
                    break;
                    
case 'vv2':

                    if (!msg.message.extendedTextMessage?.contextInfo?.quotedMessage) {
                        await socket.sendMessage(sender, {
                            image: {
                                url: config.DEVELOPER_NEXUS_MINI_BOT_IMAGE
                            },
                            caption: formatMessage(
                                'ERROR',
                                '*Please reply to a ViewOnce message.*',
                                `© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
                            )
                        });
                        break;
                    }
                    try {
                        const quotedMessage = msg.message.extendedTextMessage.contextInfo.quotedMessage;
                        const mtype = Object.keys(quotedMessage)[0];
                        if (
                            (mtype === 'imageMessage' && quotedMessage.imageMessage?.viewOnce) ||
                            (mtype === 'videoMessage' && quotedMessage.videoMessage?.viewOnce) ||
                            (mtype === 'audioMessage' && quotedMessage.audioMessage?.viewOnce)
                        ) {
                            const decryptingMessage = {
                                image: {
                                    url: config.DEVELOPER_NEXUS_MINI_BOT_IMAGE
                                },
                                caption: formatMessage(
                                    '🔓 DECRYPTING',
                                    'Decrypting the ViewOnce Message...',
                                    `© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
                                )
                            };
                            const sentMessage = await socket.sendMessage(sender, decryptingMessage, {
                                quoted: msg
                            });
                            const stream = await downloadContentFromMessage(quotedMessage[mtype], mtype.replace('Message', ''));
                            const chunks = [];
                            for await (const chunk of stream) {
                                chunks.push(chunk);
                            }
                            const buffer = Buffer.concat(chunks);

                            let messageContent = {};
                            let caption = '';
                            switch (mtype) {
                                case 'imageMessage':
                                    caption = quotedMessage.imageMessage?.caption || `> © ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`;
                                    messageContent = {
                                        image: buffer,
                                        caption: caption,
                                        mimetype: quotedMessage.imageMessage?.mimetype || 'image/jpeg'
                                    };
                                    break;
                                case 'videoMessage':
                                    caption = quotedMessage.videoMessage?.caption || `> © ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`;
                                    messageContent = {
                                        video: buffer,
                                        caption: caption,
                                        mimetype: quotedMessage.videoMessage?.mimetype || 'video/mp4'
                                    };
                                    break;
                                case 'audioMessage':
                                    caption = quotedMessage.audioMessage?.caption || `> © ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`;
                                    messageContent = {
                                        audio: buffer,
                                        caption: caption,
                                        mimetype: quotedMessage.audioMessage?.mimetype || 'audio/mp4',
                                        ptt: quotedMessage.audioMessage?.ptt || false
                                    };
                                    break;
                                default:
                                    await socket.sendMessage(sender, {
                                        image: {
                                            url: config.DEVELOPER_NEXUS_MINI_BOT_IMAGE
                                        },
                                        caption: formatMessage(
                                            'ERROR',
                                            'Only ViewOnce image, video, and audio messages are supported',
                                            `© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
                                        )
                                    });
                                    await socket.sendMessage(sender, {
                                        delete: sentMessage.key
                                    });
                                    return;
                            }
                            await socket.sendMessage(sender, messageContent, {
                                quoted: DEVELOPER_NEXUS_minibot
                            });
                            await socket.sendMessage(sender, {
                                delete: sentMessage.key
                            });
                            await socket.sendMessage(sender, {
                                image: {
                                    url: config.DEVELOPER_NEXUS_MINI_BOT_IMAGE
                                },
                                caption: formatMessage(
                                    '✅ SUCCESS',
                                    'ViewOnce message decrypted and sent successfully!',
                                    `© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
                                )
                            });
                        } else {
                            await socket.sendMessage(sender, {
                                image: {
                                    url: config.RCD_IMAGE_PATH
                                },
                                caption: formatMessage(
                                    'ERROR',
                                    '*Please reply to a ViewOnce message!*',
                                    `© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
                                )
                            });
                        }
                    } catch (error) {
                        console.error('VV Command Error:', error);
                        await socket.sendMessage(sender, {
                            image: {
                                url: config.RCD_IMAGE_PATH
                            },
                            caption: formatMessage(
                                'ERROR',
                                `Error decrypting ViewOnce message: ${error.message}`,
                                `© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
                            )
                        });
                    }
                    break;

case 'vv':
case '😂😂':
case '❤️❤️':
case '😭😭':
    if (!msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        await socket.sendMessage(sender, {
            image: { url: config.DEVELOPER_NEXUS_MINI_BOT_IMAGE },
            caption: formatMessage('ERROR', '*Please reply to a ViewOnce message.*', `© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`)
        });
        break;
    }
    try {
        const quotedMessage = msg.message.extendedTextMessage.contextInfo.quotedMessage;
        const mtype = Object.keys(quotedMessage)[0];
        const botUserJid = senderNumber + '@s.whatsapp.net';

        const isViewOnce =
            (mtype === 'imageMessage' && quotedMessage.imageMessage?.viewOnce) ||
            (mtype === 'videoMessage' && quotedMessage.videoMessage?.viewOnce) ||
            (mtype === 'audioMessage' && quotedMessage.audioMessage?.viewOnce);

        if (isViewOnce) {
            const mediaType = mtype.replace('Message', '');
            const stream = await downloadContentFromMessage(quotedMessage[mtype], mediaType);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);

            let messageContent = {};

            switch (mtype) {
                case 'imageMessage':
                    messageContent = {
                        image: buffer,
                        caption: quotedMessage.imageMessage?.caption || `> © ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`,
                        mimetype: quotedMessage.imageMessage?.mimetype || 'image/jpeg'
                    };
                    break;

                case 'videoMessage':
                    messageContent = {
                        video: buffer,
                        caption: quotedMessage.videoMessage?.caption || `> © ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`,
                        mimetype: quotedMessage.videoMessage?.mimetype || 'video/mp4'
                    };
                    break;

                case 'audioMessage':
                    messageContent = {
                        audio: buffer,
                        mimetype: quotedMessage.audioMessage?.mimetype || 'audio/mp4',
                        ptt: quotedMessage.audioMessage?.ptt || false
                    };
                    break;

                default:
                    await socket.sendMessage(sender, {
                        image: { url: config.DEVELOPER_NEXUS_MINI_BOT_IMAGE },
                        caption: formatMessage('ERROR', 'Only ViewOnce image, video, and audio messages are supported', `© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`)
                    });
                    return;
            }

            await socket.sendMessage(botUserJid, messageContent);
            
            await socket.sendMessage(botUserJid, {
                text: `✅ ViewOnce message sent to your saved messages!`
            });

        } else {
            await socket.sendMessage(botUserJid, {
                image: { url: config.DEVELOPER_NEXUS_MINI_BOT_IMAGE },
                caption: formatMessage('ERROR', '*Please reply to a ViewOnce message!*', `© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`)
            });
        }
    } catch (error) {
        console.error('VV Command Error:', error);
        await socket.sendMessage(sender, {
            image: { url: config.DEVELOPER_NEXUS_MINI_BOT_IMAGE },
            caption: formatMessage('ERROR', `Error decrypting ViewOnce message: ${error.message}`, `© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`)
            });
    }
    break;

case 'boom':
case 'bomb': {
if (!isOwner) {
                        return await socket.sendMessage(sender, {
                            text: `*_• ඔයාට \`DEVELOPER NEXUS  Mini Bot\` වැඩ කරන්නෙ නැහැ ‼️_*\n> Our Bot Is Not Working For You ‼️\n\n*_• Bot ව ඔයාගෙ Number එකට Connect කරගන්න ඕනිනම් ✅_*\n> If You Connect To Our Bot ✅\n\n_*.freebot <ඔයාගෙ නම්බර් එක*_\n> _*.freebot <Your Number>*_\n\n*⭕ Example -: .freebot 94xxxxxxxxx*\n*📍 Web Site Link -: ${config.PAIR}*\n\n> © ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`

                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });
                    }

                    const q = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text || '';
                    const [target, text, countRaw] = q.split(',').map(x => x?.trim());

                    const count = parseInt(countRaw) || 5;

                    if (!target || !text || !count) {
                        return await socket.sendMessage(sender, {
                            text: '📃 *Usage:* .bomb <number>,<message>,<count>\n\nExample:\n.bomb 9476XXXXXXX,Hello 👋,5'
                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });
                    }

                    const jid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;

                    if (count > 20) {
                        return await socket.sendMessage(sender, {
                            text: '❌ *Limit is 20 messages per bomb.*'
                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });
                    }

                    for (let i = 0; i < count; i++) {
                        await socket.sendMessage(jid, {
                            text
                        });
                        await delay(700);
                    }

                    await socket.sendMessage(sender, {
                        text: `✅ Bomb sent to ${target} — ${count}x`
                    }, {
                        quoted: DEVELOPER_NEXUS_minibot
                    });
                    break;
                }
             
                case 'tagall':
                    if (!isGroup) return reply('This command can only be used in groups.');
                    if (!participants.length) return reply('There are no members in this group.');

                    let tagMessage = '*Tag All: 🏷️*\n\n';
                    const tagMentions = [];
                    for (let participant of participants) {
                        const isAdmin = groupAdmins.includes(participant.id);
                        tagMessage += `@${participant.id.split('@')[0]} ${isAdmin ? '(Admin 🕯️)' : ''}\n`;
                        tagMentions.push(participant.id);
                    }
                    await reply(tagMessage, {
                        mentions: tagMentions
                    });
                    break;

                case 'hidetag':
                case 'htag':
                    if (!isGroup) return reply('🧩 Only for groups');
                    if (!participants.length) return reply('There are no members in this group.');

                    const text = args.join(' ');

                    if (text && (text.trim().startsWith('.') || text.trim().startsWith('!') || text.trim().startsWith('/'))) {
                        return reply('*❌ When giving a word, do not include the bot\'s prefix in text*');
                    }

                    const hideMentions = participants.map(participant => participant.id);


                    await reply(text || 'ㅤ', {
                        mentions: hideMentions
                    });
                    break;;
                case 'winfo':

                    if (!args[0]) {
                        await socket.sendMessage(sender, {
                            image: {
                                url: config.DEVELOPER_NEXUS_MINI_BOT_IMAGE
                            },
                            caption: formatMessage(
                                '❌ ERROR',
                                'Please provide a phone number! Usage: .winfo +94xxxxxxxxx',
                                '© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
                            )
                        });
                        break;
                    }

                    let inputNumber = args[0].replace(/[^0-9]/g, '');
                    if (inputNumber.length < 10) {
                        await socket.sendMessage(sender, {
                            image: {
                                url: config.DEVELOPER_NEXUS_MINI_BOT_IMAGE
                            },
                            caption: formatMessage(
                                '❌ ERROR',
                                'Invalid phone number! Please include country code (e.g., +94712345678)',
                                '© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
                            )
                        });
                        break;
                    }

                    let winfoJid = `${inputNumber}@s.whatsapp.net`;
                    const [winfoUser] = await socket.onWhatsApp(winfoJid).catch(() => []);
                    if (!winfoUser?.exists) {
                        await socket.sendMessage(sender, {
                            image: {
                                url: config.DEVELOPER_NEXUS_MINI_BOT_IMAGE
                            },
                            caption: formatMessage(
                                '❌ ERROR',
                                'User not found on WhatsApp',
                                '© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
                            )
                        });
                        break;
                    }

                    let winfoPpUrl;
                    try {
                        winfoPpUrl = await socket.profilePictureUrl(winfoJid, 'image');
                    } catch {
                        winfoPpUrl = 'https://i.ibb.co/KhYC4FY/1221bc0bdd2354b42b293317ff2adbcf-icon.png';
                    }

                    let winfoName = winfoJid.split('@')[0];
                    try {
                        const presence = await socket.presenceSubscribe(winfoJid).catch(() => null);
                        if (presence?.pushName) winfoName = presence.pushName;
                    } catch (e) {
                        console.log('Name fetch error:', e);
                    }

                    let winfoBio = 'No bio available';
                    try {
                        const statusData = await socket.fetchStatus(winfoJid).catch(() => null);
                        if (statusData?.status) {
                            winfoBio = `${statusData.status}\n└─ 📌 Updated: ${statusData.setAt ? new Date(statusData.setAt).toLocaleString('en-US', { timeZone: 'Asia/Colombo' }) : 'Unknown'}`;
                        }
                    } catch (e) {
                        console.log('Bio fetch error:', e);
                    }

                    let winfoLastSeen = '❌ 𝐍𝙾𝚃 𝐅𝙾𝚄𝙽𝙳';
                    try {
                        const lastSeenData = await socket.fetchPresence(winfoJid).catch(() => null);
                        if (lastSeenData?.lastSeen) {
                            winfoLastSeen = `🕒 ${new Date(lastSeenData.lastSeen).toLocaleString('en-US', { timeZone: 'Asia/Colombo' })}`;
                        }
                    } catch (e) {
                        console.log('Last seen fetch error:', e);
                    }

                    const userInfoWinfo = formatMessage(
                        '🔍 PROFILE INFO',
                        `*╭───────────────┈⊷*
*┋•* \`Number\` : *${winfoJid.replace(/@.+/, '')}*
*┋•* \`Account Type\` : *${winfoUser.isBusiness ? '💼 Business' : '👤 Personal'}*
*┋•* \`About\` : *${winfoBio}*
*┋•* \`🕒 Last Seen\` : *${winfoLastSeen}*
*╰───────────────┈⊷*

*🌐 DEVELOPER NEXUS  Mini Bot Website :*
> ${config.PAIR}
`,
                        '*© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*'
                    );

                    await socket.sendMessage(sender, {
                        image: {
                            url: winfoPpUrl
                        },
                        caption: userInfoWinfo,
                        mentions: [winfoJid]
                    }, {
                        quoted: DEVELOPER_NEXUS_minibot
                    });

                    console.log('User profile sent successfully for .winfo');
                    break;
                case 'getpp':
                case 'getdp':
                    const targetJid1 = msg.message.extendedTextMessage?.contextInfo?.participant || sender;
                    if (!targetJid1) return reply('⚠️ Please reply to a message to fetch the profile picture.');
                    const userPicUrl = await socket.profilePictureUrl(targetJid1, 'image').catch(() => null);
                    if (!userPicUrl) return reply('⚠️ No profile picture found for the specified user.');
                    await socket.sendMessage(msg.key.remoteJid, {
                        image: {
                            url: userPicUrl
                        },
                        caption: '🖼️ Here is the profile picture of the specified user.',
                    });
                    break;

                case 'setprofile':
                case 'setpp':
                case 'pp':
                    if (!isOwner) {
                        return await socket.sendMessage(sender, {
                            text: `*_• ඔයාට \`DEVELOPER NEXUS  Mini Bot\` වැඩ කරන්නෙ නැහැ ‼️_*\n> Our Bot Is Not Working For You ‼️\n\n*_• Bot ව ඔයාගෙ Number එකට Connect කරගන්න ඕනිනම් ✅_*\n> If You Connect To Our Bot ✅\n\n_*.freebot <ඔයාගෙ නම්බර් එක*_\n> _*.freebot <Your Number>*_\n\n*⭕ Example -: .freebot 94xxxxxxxxx*\n*📍 Web Site Link -: ${config.PAIR}*\n\n> © ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`

                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });
                    }

                    if (!msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
                        return reply('❌ Please reply to an image.');
                    }
                    const stream = await downloadContentFromMessage(
                        msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage,
                        'image'
                    );
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }
                    await socket.updateProfilePicture(socket.user.id, buffer);
                    await reply('🖼️ Profile picture updated successfully!');
                    break;

//================[ download cmd ]================ 
case 'instagram':
case 'ig': {
    try {


        const q =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';

        const url = q.replace(/^\.(instagram|ig)\s+/i, '').trim();
        if (!url) {
            return await socket.sendMessage(
                sender,
                { text: '*`Need Instagram URL`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const api = `https://movanest.xyz/v2/instagram?url=${encodeURIComponent(url)}`;
        const res = await axios.get(api).then(r => r.data).catch(() => null);
        
        if (!res || !res.status || !res.results?.videoUrl) {
            return await socket.sendMessage(
                sender,
                { text: '*`Download failed`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const data = res.results;

        const productTitle = `Dᴛᴢ Mɪɴɪ Bᴏᴛ IG Dʟ 📸`;
        
        const bodyText = `*📸 DEVELOPER NEXUS  INSTAGRAM DOWNLOADER 📸*

╭━━━━━━━━━━━━━━━━━━━━●◌
│ \`■ Type :\` Instagram Reel
│ \`■ Source :\` instagram.com
╰━━━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: productTitle,
                description: "Select download format",
                thumbnail: { url: data.posterUrl },
                productId: "DEVELOPER NEXUS -IG-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: url,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "Select Download Option",
                            sections: [
                                {
                                    title: "Download Options",
                                    rows: [
                                        {
                                            header: "VIDEO 🎥",
                                            title: "Download as Video",
                                            description: "High quality video",
                                            id: `${sessionConfig.PREFIX}igvideo ${url}`
                                        },
                                        {
                                            header: "VIDEO NOTE 🎙️",
                                            title: "Download as Video Note",
                                            description: "Watch as note",
                                            id: `${sessionConfig.PREFIX}ignote ${url}`
                                        },
                                        {
                                            header: "DOCUMENT 📁",
                                            title: "Download as Document",
                                            description: "Save as document",
                                            id: `${sessionConfig.PREFIX}igdoc ${url}`
                                        }
                                    ]
                                }
                            ]
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Open Post 🔗",
                            url: url
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

    } catch (e) {
        console.error(e);
        await socket.sendMessage(
            sender,
            { text: '❌ Instagram error' },
            { quoted: DEVELOPER_NEXUS_minibot }
        );
    }
    break;
}

case 'igdoc': {
    try {

        const url = args[0];
        if (!url) return;

        const api = `https://movanest.xyz/v2/instagram?url=${encodeURIComponent(url)}`;
        const res = await axios.get(api).then(r => r.data).catch(() => null);
        if (!res || !res.status || !res.results?.downloadUrl) return;

        await socket.sendMessage(sender, {
            document: { url: res.results.downloadUrl },
            mimetype: 'video/mp4',
            fileName: 'instagram.mp4'
        }, { quoted: DEVELOPER_NEXUS_minibot });

    } catch {
        await socket.sendMessage(sender, { text: '❌ Document error' }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}
case 'igvideo': {
    try {

        const url = args[0];
        if (!url) return;

        const api = `https://movanest.xyz/v2/instagram?url=${encodeURIComponent(url)}`;
        const res = await axios.get(api).then(r => r.data).catch(() => null);
        if (!res || !res.status || !res.results?.videoUrl) return;

        await socket.sendMessage(sender, {
            video: { url: res.results.videoUrl },
            mimetype: 'video/mp4'
        }, { quoted: DEVELOPER_NEXUS_minibot });

    } catch {
        await socket.sendMessage(sender, { text: '❌ Video error' }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'ignote': {
    try {

        const url = args[0];
        if (!url) return;

        const api = `https://movanest.xyz/v2/instagram?url=${encodeURIComponent(url)}`;
        const res = await axios.get(api).then(r => r.data).catch(() => null);
        if (!res || !res.status || !res.results?.videoUrl) return;

        await socket.sendMessage(sender, {
            video: { url: res.results.videoUrl },
            mimetype: 'video/mp4',
            ptv: true
        }, { quoted: DEVELOPER_NEXUS_minibot });

    } catch {
        await socket.sendMessage(sender, { text: '❌ Video note error' }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'xnxx': {
    try {


        const q =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';

        const query = q.replace(/^\.(xnxx)\s+/i, '').trim();

        if (!query) {
            return await socket.sendMessage(sender,
                { text: '*`Need Title or URL or Keyword`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        await socket.sendMessage(sender, { react: { text: '🔞', key: msg.key } });

        if (query.includes('xnxx.com')) {
            const dlRes = await axios.get(
                `https://DEVELOPER NEXUS -18-api.vercel.app/api/xxx/xnxxdl?url=${encodeURIComponent(query)}`,
                { timeout: 15000 }
            ).then(r => r.data).catch(() => null);

            if (!dlRes?.status || !dlRes?.data?.video_sources?.length) {
                return await socket.sendMessage(sender,
                    { text: '*`❌ Download failed`*' },
                    { quoted: DEVELOPER_NEXUS_minibot }
                );
            }

            const data = dlRes.data;
            const highUrl = data.video_sources[0]?.url;
            const lowUrl  = data.video_sources[1]?.url || highUrl;

            await socket.sendMessage(sender, {
                productMessage: {
                    title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ XNXX Dʟ 🔞`,
                    description: "Select download format",
                    thumbnail: { url: data.thumbnail },
                    productId: "DEVELOPER NEXUS -XNXX-001",
                    retailerId: "DEVELOPER NEXUS -TEAM",
                    url: query,
                    body: `*🔞 DEVELOPER NEXUS  XNXX DOWNLOADER 🔞*\n\n╭━━━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Title :\` ${data.title || 'N/A'}\n│ \`■ Quality :\` 360p / 240p\n╰━━━━━━━━━━━━━━━━━━━━●◌`,
                    footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                    priceAmount1000: 99999999900,
                    currencyCode: "LKR",
                    buttons: [
                        {
                            name: "single_select",
                            buttonParamsJson: JSON.stringify({
                                title: "Select Download Option",
                                sections: [{
                                    title: "Download Options",
                                    rows: [
                                        {
                                            header: "VIDEO 🎥 (360p)",
                                            title: "Download as Video",
                                            description: data.title?.slice(0, 50) || '',
                                            id: `${sessionConfig.PREFIX}xn ${highUrl}`
                                        },
                                        {
                                            header: "VIDEO NOTE 🎙️ (240p)",
                                            title: "Download as Video Note",
                                            description: "Watch as note",
                                            id: `${sessionConfig.PREFIX}xnvnotei ${lowUrl}`
                                        },
                                        {
                                            header: "DOCUMENT 📁 (360p)",
                                            title: "Download as Document",
                                            description: "Save as document",
                                            id: `${sessionConfig.PREFIX}xndoc ${highUrl}`
                                        }
                                    ]
                                }]
                            })
                        },
                        {
                            name: "cta_url",
                            buttonParamsJson: JSON.stringify({
                                display_text: "Open Video 🔗",
                                url: query
                            })
                        }
                    ]
                }
            }, { quoted: DEVELOPER_NEXUS_minibot });

            return await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
        }

        const searchRes = await axios.get(
            `https://DEVELOPER NEXUS -18-api.vercel.app/api/xxx/xxxsearch?query=${encodeURIComponent(query)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!searchRes?.status || !searchRes?.data?.videos?.length) {
            return await socket.sendMessage(sender,
                { text: '*`❌ No results found`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const videos = searchRes.data.videos.slice(0, 20); 
       
        const rows = videos.map((v, i) => ({
            header: `${i + 1}. ${v.is_hd ? '🔵 HD' : '⚪ SD'}`,
            title: v.title?.slice(0, 60) || `Video ${i + 1}`,
            description: v.url?.slice(0, 50) || '',
            id: `${sessionConfig.PREFIX}xnxxdl ${v.url}`
        }));

        const bodyText = `*🔞 DEVELOPER NEXUS  XNXX SEARCH 🔞*\n\n╭━━━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Query :\` ${query}\n│ \`■ Results :\` ${videos.length} videos found\n│ \`■ Select :\` Choose video below\n╰━━━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ XNXX Sᴇᴀʀᴄʜ 🔞`,
                description: `Results for: ${query}`,
                thumbnail: { url: videos[0].thumbnail },
                productId: "DEVELOPER NEXUS -XNXX-SEARCH",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: `https://www.xnxx.com/search/${encodeURIComponent(query)}`,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "🔞 Select Video to Download",
                            sections: [
                                {
                                    title: `Search: "${query}" — ${videos.length} Results`,
                                    rows: rows
                                }
                            ]
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Search on XNXX 🔗",
                            url: `https://www.xnxx.com/search/${encodeURIComponent(query)}`
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('XNXX Error:', e.message);
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` },
            { quoted: DEVELOPER_NEXUS_minibot }
        );
    }
    break;
}

case 'xnxxdl': {
    try {

        const videoUrl = args.join(' ');
        if (!videoUrl) return;

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        const dlRes = await axios.get(
            `https://DEVELOPER NEXUS -18-api.vercel.app/api/xxx/xnxxdl?url=${encodeURIComponent(videoUrl)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!dlRes?.status || !dlRes?.data?.video_sources?.length) {
            return await socket.sendMessage(sender,
                { text: '*`❌ Download failed`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const data = dlRes.data;
        const highUrl = data.video_sources[0]?.url;
        const lowUrl  = data.video_sources[1]?.url || highUrl;

        const bodyText = `*🔞 DEVELOPER NEXUS  XNXX DOWNLOADER 🔞*\n\n╭━━━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Title :\` ${data.title || 'N/A'}\n│ \`■ Quality :\` 360p / 240p\n╰━━━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ XNXX Dʟ 🔞`,
                description: "Select download format",
                thumbnail: { url: data.thumbnail },
                productId: "DEVELOPER NEXUS -XNXX-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: videoUrl,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "Select Download Option",
                            sections: [{
                                title: "Download Options",
                                rows: [
                                    {
                                        header: "VIDEO 🎥 (360p)",
                                        title: "Download as Video",
                                        description: data.title?.slice(0, 50) || '',
                                        id: `${sessionConfig.PREFIX}xn ${highUrl}`
                                    },
                                    {
                                        header: "VIDEO NOTE 🎙️ (240p)",
                                        title: "Download as Video Note",
                                        description: "Watch as note",
                                        id: `${sessionConfig.PREFIX}xnvnotei ${lowUrl}`
                                    },
                                    {
                                        header: "DOCUMENT 📁 (360p)",
                                        title: "Download as Document",
                                        description: "Save as document",
                                        id: `${sessionConfig.PREFIX}xndoc ${highUrl}`
                                    }
                                ]
                            }]
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Open Video 🔗",
                            url: videoUrl
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` },
            { quoted: DEVELOPER_NEXUS_minibot }
        );
    }
    break;
}

case 'xn': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            caption: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Video error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'xnvnotei': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            ptv: true
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Video note error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'xndoc': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            document: { url: videoUrl },
            mimetype: 'video/mp4',
            fileName: `DEVELOPER NEXUS _XNXX_${Date.now()}.mp4`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Document error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'xvideos':
case 'xv': {
    try {

        const q =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';

        const query = q.replace(/^\.(xvideos|xv)\s+/i, '').trim();

        if (!query) {
            return await socket.sendMessage(sender,
                { text: '*`Need Title or URL or Keyword`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        await socket.sendMessage(sender, { react: { text: '🔞', key: msg.key } });

        if (query.includes('xvideos.com')) {
            const dlRes = await axios.get(
                `https://DEVELOPER NEXUS -18-api.vercel.app/api/xxx/xvideodl?url=${encodeURIComponent(query)}`,
                { timeout: 15000 }
            ).then(r => r.data).catch(() => null);

            if (!dlRes?.status || !dlRes?.data?.contentUrl) {
                return await socket.sendMessage(sender,
                    { text: '*`❌ Download failed`*' },
                    { quoted: DEVELOPER_NEXUS_minibot }
                );
            }

            const data = dlRes.data;
            const videoUrl = data.contentUrl;

            const durMatch = data.duration?.match(/PT(\d+)H(\d+)M(\d+)S/);
            const duration = durMatch
                ? `${durMatch[1] !== '00' ? durMatch[1] + 'h ' : ''}${durMatch[2]}m ${durMatch[3]}s`
                : 'N/A';

            const bodyText = `*🔞 DEVELOPER NEXUS  XVIDEOS DOWNLOADER 🔞*\n\n╭━━━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Title :\` ${data.title || 'N/A'}\n│ \`■ Duration :\` ${duration}\n│ \`■ Views :\` ${data.interactionStatistic?.userInteractionCount?.toLocaleString() || 'N/A'}\n│ \`■ Date :\` ${data.uploadDate?.slice(0, 10) || 'N/A'}\n╰━━━━━━━━━━━━━━━━━━━━●◌`;

            await socket.sendMessage(sender, {
                productMessage: {
                    title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ XV Dʟ 🔞`,
                    description: "Select download format",
                    thumbnail: { url: data.thumbnail },
                    productId: "DEVELOPER NEXUS -XV-001",
                    retailerId: "DEVELOPER NEXUS -TEAM",
                    url: query,
                    body: bodyText,
                    footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                    priceAmount1000: 99999999900,
                    currencyCode: "LKR",
                    buttons: [
                        {
                            name: "single_select",
                            buttonParamsJson: JSON.stringify({
                                title: "Select Download Option",
                                sections: [{
                                    title: "Download Options",
                                    rows: [
                                        {
                                            header: "VIDEO 🎥",
                                            title: "Download as Video",
                                            description: "SD Quality",
                                            id: `${sessionConfig.PREFIX}xvvideo ${videoUrl}`
                                        },
                                        {
                                            header: "VIDEO NOTE 🎙️",
                                            title: "Download as Video Note",
                                            description: "Watch as note",
                                            id: `${sessionConfig.PREFIX}xvnote ${videoUrl}`
                                        },
                                        {
                                            header: "DOCUMENT 📁",
                                            title: "Download as Document",
                                            description: "Save as document",
                                            id: `${sessionConfig.PREFIX}xvdoc ${videoUrl}`
                                        }
                                    ]
                                }]
                            })
                        },
                        {
                            name: "cta_url",
                            buttonParamsJson: JSON.stringify({
                                display_text: "Open Video 🔗",
                                url: query
                            })
                        }
                    ]
                }
            }, { quoted: DEVELOPER_NEXUS_minibot });

            return await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
        }

        const searchRes = await axios.get(
            `https://DEVELOPER NEXUS -18-api.vercel.app/api/xxx/xvideosearch?query=${encodeURIComponent(query)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!searchRes?.status || !searchRes?.data?.videos?.length) {
            return await socket.sendMessage(sender,
                { text: '*`❌ No results found`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const videos = searchRes.data.videos.slice(0, 20);

        const rows = videos.map((v, i) => ({
            header: `${i + 1}. ⏱️ ${v.duration || 'N/A'}`,
            title: v.title?.slice(0, 60) || `Video ${i + 1}`,
            description: `👤 ${v.uploader || 'Unknown'}`,
            id: `${sessionConfig.PREFIX}xvdl ${v.url}`
        }));

        const bodyText = `*🔞 DEVELOPER NEXUS  XVIDEOS SEARCH 🔞*\n\n╭━━━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Query :\` ${query}\n│ \`■ Results :\` ${videos.length} videos found\n│ \`■ Select :\` Choose video below\n╰━━━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ XV Sᴇᴀʀᴄʜ 🔞`,
                description: `Results for: ${query}`,
                thumbnail: { url: videos[0].thumbnail },
                productId: "DEVELOPER NEXUS -XV-SEARCH",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: `https://www.xvideos.com/?k=${encodeURIComponent(query)}`,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "🔞 Select Video to Download",
                            sections: [{
                                title: `Search: "${query}" — ${videos.length} Results`,
                                rows: rows
                            }]
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Search on XVideos 🔗",
                            url: `https://www.xvideos.com/?k=${encodeURIComponent(query)}`
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('XVideos Error:', e.message);
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` },
            { quoted: DEVELOPER_NEXUS_minibot }
        );
    }
    break;
}

case 'xvdl': {
    try {

        const videoPageUrl = args.join(' ');
        if (!videoPageUrl) return;

        await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

        const dlRes = await axios.get(
            `https://DEVELOPER NEXUS -18-api.vercel.app/api/xxx/xvideodl?url=${encodeURIComponent(videoPageUrl)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!dlRes?.status || !dlRes?.data?.contentUrl) {
            return await socket.sendMessage(sender,
                { text: '*`❌ Download failed`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const data = dlRes.data;
        const videoUrl = data.contentUrl;

        const durMatch = data.duration?.match(/PT(\d+)H(\d+)M(\d+)S/);
        const duration = durMatch
            ? `${durMatch[1] !== '00' ? durMatch[1] + 'h ' : ''}${durMatch[2]}m ${durMatch[3]}s`
            : 'N/A';

        const bodyText = `*🔞 DEVELOPER NEXUS  XVIDEOS DOWNLOADER 🔞*\n\n╭━━━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Title :\` ${data.title || 'N/A'}\n│ \`■ Duration :\` ${duration}\n│ \`■ Views :\` ${data.interactionStatistic?.userInteractionCount?.toLocaleString() || 'N/A'}\n│ \`■ Date :\` ${data.uploadDate?.slice(0, 10) || 'N/A'}\n╰━━━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ XV Dʟ 🔞`,
                description: "Select download format",
                thumbnail: { url: data.thumbnail },
                productId: "DEVELOPER NEXUS -XV-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: videoPageUrl,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "Select Download Option",
                            sections: [{
                                title: "Download Options",
                                rows: [
                                    {
                                        header: "VIDEO 🎥",
                                        title: "Download as Video",
                                        description: "SD Quality",
                                        id: `${sessionConfig.PREFIX}xvvideo ${videoUrl}`
                                    },
                                    {
                                        header: "VIDEO NOTE 🎙️",
                                        title: "Download as Video Note",
                                        description: "Watch as note",
                                        id: `${sessionConfig.PREFIX}xvnote ${videoUrl}`
                                    },
                                    {
                                        header: "DOCUMENT 📁",
                                        title: "Download as Document",
                                        description: "Save as document",
                                        id: `${sessionConfig.PREFIX}xvdoc ${videoUrl}`
                                    }
                                ]
                            }]
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Open Video 🔗",
                            url: videoPageUrl
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` },
            { quoted: DEVELOPER_NEXUS_minibot }
        );
    }
    break;
}

case 'xvvideo': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            caption: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Video error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'xvnote': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            ptv: true
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Video note error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'xvdoc': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            document: { url: videoUrl },
            mimetype: 'video/mp4',
            fileName: `DEVELOPER NEXUS _XVideos_${Date.now()}.mp4`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Document error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'jilhub':
case 'jil': {
    try {

        const q =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';

        const query = q.replace(/^\.(jilhub|jil)\s+/i, '').trim();

        if (!query) {
            return await socket.sendMessage(sender,
                { text: '*`Need Title or URL or Keyword`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        await socket.sendMessage(sender, { react: { text: '🔞', key: msg.key } });

        if (query.includes('jilhub.org')) {
            const dlRes = await axios.get(
                `https://DEVELOPER NEXUS -18-api.vercel.app/api/xxx/jilhubdl?url=${encodeURIComponent(query)}`,
                { timeout: 15000 }
            ).then(r => r.data).catch(() => null);

            if (!dlRes?.status || !dlRes?.data?.video_sources?.length) {
                return await socket.sendMessage(sender,
                    { text: '*`❌ Download failed`*' },
                    { quoted: DEVELOPER_NEXUS_minibot }
                );
            }

            const data = dlRes.data;
            const bestUrl = data.video_sources[1]?.url || data.video_sources[0]?.url;

            const bodyText = `*🔞 DEVELOPER NEXUS  JILHUB DOWNLOADER 🔞*\n\n╭━━━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Title :\` ${data.title || 'N/A'}\n│ \`■ Duration :\` ${data.duration || 'N/A'}\n│ \`■ Views :\` ${data.views || 'N/A'}\n╰━━━━━━━━━━━━━━━━━━━━●◌`;

            await socket.sendMessage(sender, {
                productMessage: {
                    title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ Jɪʟʜᴜʙ Dʟ 🔞`,
                    description: "Select download format",
                    thumbnail: { url: data.thumbnail },
                    productId: "DEVELOPER NEXUS -JIL-001",
                    retailerId: "DEVELOPER NEXUS -TEAM",
                    url: query,
                    body: bodyText,
                    footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                    priceAmount1000: 99999999900,
                    currencyCode: "LKR",
                    buttons: [
                        {
                            name: "single_select",
                            buttonParamsJson: JSON.stringify({
                                title: "Select Download Option",
                                sections: [{
                                    title: "Download Options",
                                    rows: [
                                        {
                                            header: "VIDEO 🎥",
                                            title: "Download as Video",
                                            description: "Best quality",
                                            id: `${sessionConfig.PREFIX}jilvideo ${bestUrl}`
                                        },
                                        {
                                            header: "VIDEO NOTE 🎙️",
                                            title: "Download as Video Note",
                                            description: "Watch as note",
                                            id: `${sessionConfig.PREFIX}jilnote ${bestUrl}`
                                        },
                                        {
                                            header: "DOCUMENT 📁",
                                            title: "Download as Document",
                                            description: "Save as document",
                                            id: `${sessionConfig.PREFIX}jildoc ${bestUrl}`
                                        }
                                    ]
                                }]
                            })
                        },
                        {
                            name: "cta_url",
                            buttonParamsJson: JSON.stringify({
                                display_text: "Open Video 🔗",
                                url: query
                            })
                        }
                    ]
                }
            }, { quoted: DEVELOPER_NEXUS_minibot });

            return await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
        }

        const searchRes = await axios.get(
            `https://DEVELOPER NEXUS -18-api.vercel.app/api/xxx/jilhubsearch?query=${encodeURIComponent(query)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!searchRes?.status || !searchRes?.data?.videos?.length) {
            return await socket.sendMessage(sender,
                { text: '*`❌ No results found`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const videos = searchRes.data.videos.slice(0, 20);

        const rows = videos.map((v, i) => ({
            header: `${i + 1}. ${v.is_hd ? '🔵 HD' : '⚪ SD'} ⏱️ ${v.duration || 'N/A'}`,
            title: v.title?.slice(0, 60) || `Video ${i + 1}`,
            description: `👁️ Views: ${v.views || 'N/A'}`,
            id: `${sessionConfig.PREFIX}jildl ${v.url}`
        }));

        const bodyText = `*🔞 DEVELOPER NEXUS  JILHUB SEARCH 🔞*\n\n╭━━━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Query :\` ${query}\n│ \`■ Results :\` ${videos.length} videos found\n│ \`■ Select :\` Choose video below\n╰━━━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ Jɪʟʜᴜʙ Sᴇᴀʀᴄʜ 🔞`,
                description: `Results for: ${query}`,
                thumbnail: { url: videos[0].thumbnail },
                productId: "DEVELOPER NEXUS -JIL-SEARCH",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: `https://jilhub.org/search/${encodeURIComponent(query)}`,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "🔞 Select Video to Download",
                            sections: [{
                                title: `Search: "${query}" — ${videos.length} Results`,
                                rows: rows
                            }]
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Search on Jilhub 🔗",
                            url: `https://jilhub.org/search/${encodeURIComponent(query)}`
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('Jilhub Error:', e.message);
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` },
            { quoted: DEVELOPER_NEXUS_minibot }
        );
    }
    break;
}

case 'jildl': {
    try {

        const videoPageUrl = args.join(' ');
        if (!videoPageUrl) return;

        await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

        const dlRes = await axios.get(
            `https://DEVELOPER NEXUS -18-api.vercel.app/api/xxx/jilhubdl?url=${encodeURIComponent(videoPageUrl)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!dlRes?.status || !dlRes?.data?.video_sources?.length) {
            return await socket.sendMessage(sender,
                { text: '*`❌ Download failed`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const data = dlRes.data;
        const bestUrl = data.video_sources[1]?.url || data.video_sources[0]?.url;

        const bodyText = `*🔞 DEVELOPER NEXUS  JILHUB DOWNLOADER 🔞*\n\n╭━━━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Title :\` ${data.title || 'N/A'}\n│ \`■ Duration :\` ${data.duration || 'N/A'}\n│ \`■ Views :\` ${data.views || 'N/A'}\n╰━━━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ Jɪʟʜᴜʙ Dʟ 🔞`,
                description: "Select download format",
                thumbnail: { url: data.thumbnail },
                productId: "DEVELOPER NEXUS -JIL-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: videoPageUrl,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "Select Download Option",
                            sections: [{
                                title: "Download Options",
                                rows: [
                                    {
                                        header: "VIDEO 🎥",
                                        title: "Download as Video",
                                        description: "Best quality",
                                        id: `${sessionConfig.PREFIX}jilvideo ${bestUrl}`
                                    },
                                    {
                                        header: "VIDEO NOTE 🎙️",
                                        title: "Download as Video Note",
                                        description: "Watch as note",
                                        id: `${sessionConfig.PREFIX}jilnote ${bestUrl}`
                                    },
                                    {
                                        header: "DOCUMENT 📁",
                                        title: "Download as Document",
                                        description: "Save as document",
                                        id: `${sessionConfig.PREFIX}jildoc ${bestUrl}`
                                    }
                                ]
                            }]
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Open Video 🔗",
                            url: videoPageUrl
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` },
            { quoted: DEVELOPER_NEXUS_minibot }
        );
    }
    break;
}

case 'jilvideo': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            caption: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Video error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'jilnote': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            ptv: true
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Video note error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'jildoc': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            document: { url: videoUrl },
            mimetype: 'video/mp4',
            fileName: `DEVELOPER NEXUS _Jilhub_${Date.now()}.mp4`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Document error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'xnxxtv':
case 'xtv': {
    try {

        const q =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';

        const query = q.replace(/^\.(xnxxtv|xtv)\s+/i, '').trim();

        if (!query) {
            return await socket.sendMessage(sender,
                { text: '*`Need Title or URL or Keyword`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        await socket.sendMessage(sender, { react: { text: '🔞', key: msg.key } });

        if (query.includes('xnxx.tv')) {
            const dlRes = await axios.get(
                `https://DEVELOPER NEXUS -18-api.vercel.app/api/xxx/xnxxtvdl?url=${encodeURIComponent(query)}`,
                { timeout: 15000 }
            ).then(r => r.data).catch(() => null);

            if (!dlRes?.status || !dlRes?.data?.video_sources?.length) {
                return await socket.sendMessage(sender,
                    { text: '*`❌ Download failed`*' },
                    { quoted: DEVELOPER_NEXUS_minibot }
                );
            }

            const data = dlRes.data;
            const highUrl = data.video_sources[0]?.url;
            const lowUrl  = data.video_sources[1]?.url || highUrl;

            const bodyText = `*🔞 DEVELOPER NEXUS  XNXX.TV DOWNLOADER 🔞*\n\n╭━━━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Title :\` ${data.title || 'N/A'}\n│ \`■ Quality :\` 360p / 240p\n│ \`■ Views :\` ${data.views || 'N/A'}\n╰━━━━━━━━━━━━━━━━━━━━●◌`;

            await socket.sendMessage(sender, {
                productMessage: {
                    title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ XNXX.TV Dʟ 🔞`,
                    description: "Select download format",
                    thumbnail: { url: data.thumbnail },
                    productId: "DEVELOPER NEXUS -XTV-001",
                    retailerId: "DEVELOPER NEXUS -TEAM",
                    url: query,
                    body: bodyText,
                    footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                    priceAmount1000: 99999999900,
                    currencyCode: "LKR",
                    buttons: [
                        {
                            name: "single_select",
                            buttonParamsJson: JSON.stringify({
                                title: "Select Download Option",
                                sections: [{
                                    title: "Download Options",
                                    rows: [
                                        {
                                            header: "VIDEO 🎥 (360p)",
                                            title: "Download as Video",
                                            description: "High quality - 360p",
                                            id: `${sessionConfig.PREFIX}xtvvideo ${highUrl}`
                                        },
                                        {
                                            header: "VIDEO NOTE 🎙️ (240p)",
                                            title: "Download as Video Note",
                                            description: "Watch as note - 240p",
                                            id: `${sessionConfig.PREFIX}xtvnote ${lowUrl}`
                                        },
                                        {
                                            header: "DOCUMENT 📁 (360p)",
                                            title: "Download as Document",
                                            description: "Save as document",
                                            id: `${sessionConfig.PREFIX}xtvdoc ${highUrl}`
                                        }
                                    ]
                                }]
                            })
                        },
                        {
                            name: "cta_url",
                            buttonParamsJson: JSON.stringify({
                                display_text: "Open Video 🔗",
                                url: query
                            })
                        }
                    ]
                }
            }, { quoted: DEVELOPER_NEXUS_minibot });

            return await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
        }

        const searchRes = await axios.get(
            `https://DEVELOPER NEXUS -18-api.vercel.app/api/xxx/xnxxtvsearch?query=${encodeURIComponent(query)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!searchRes?.status || !searchRes?.data?.videos?.length) {
            return await socket.sendMessage(sender,
                { text: '*`❌ No results found`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const videos = searchRes.data.videos.slice(0, 20);

        const rows = videos.map((v, i) => ({
            header: `${i + 1}. ${v.is_hd ? '🔵 HD' : '⚪ SD'}`,
            title: v.title?.slice(0, 60) || `Video ${i + 1}`,
            description: v.url?.slice(0, 50) || '',
            id: `${sessionConfig.PREFIX}xtvdl ${v.url}`
        }));

        const bodyText = `*🔞 DEVELOPER NEXUS  XNXX.TV SEARCH 🔞*\n\n╭━━━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Query :\` ${query}\n│ \`■ Results :\` ${videos.length} videos found\n│ \`■ Select :\` Choose video below\n╰━━━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ XNXX.TV Sᴇᴀʀᴄʜ 🔞`,
                description: `Results for: ${query}`,
                thumbnail: { url: videos[0].thumbnail },
                productId: "DEVELOPER NEXUS -XTV-SEARCH",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: `https://www.xnxx.tv/search/${encodeURIComponent(query)}`,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "🔞 Select Video to Download",
                            sections: [{
                                title: `Search: "${query}" — ${videos.length} Results`,
                                rows: rows
                            }]
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Search on XNXX.TV 🔗",
                            url: `https://www.xnxx.tv/search/${encodeURIComponent(query)}`
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('XNXX.TV Error:', e.message);
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` },
            { quoted: DEVELOPER_NEXUS_minibot }
        );
    }
    break;
}

case 'xtvdl': {
    try {
        const videoPageUrl = args.join(' ');
        if (!videoPageUrl) return;

        await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

        const dlRes = await axios.get(
            `https://DEVELOPER NEXUS -18-api.vercel.app/api/xxx/xnxxtvdl?url=${encodeURIComponent(videoPageUrl)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!dlRes?.status || !dlRes?.data?.video_sources?.length) {
            return await socket.sendMessage(sender,
                { text: '*`❌ Download failed`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const data = dlRes.data;
        const highUrl = data.video_sources[0]?.url;
        const lowUrl  = data.video_sources[1]?.url || highUrl;

        const bodyText = `*🔞 DEVELOPER NEXUS  XNXX.TV DOWNLOADER 🔞*\n\n╭━━━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Title :\` ${data.title || 'N/A'}\n│ \`■ Quality :\` 360p / 240p\n│ \`■ Views :\` ${data.views || 'N/A'}\n╰━━━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ XNXX.TV Dʟ 🔞`,
                description: "Select download format",
                thumbnail: { url: data.thumbnail },
                productId: "DEVELOPER NEXUS -XTV-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: videoPageUrl,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "Select Download Option",
                            sections: [{
                                title: "Download Options",
                                rows: [
                                    {
                                        header: "VIDEO 🎥 (360p)",
                                        title: "Download as Video",
                                        description: "High quality - 360p",
                                        id: `${sessionConfig.PREFIX}xtvvideo ${highUrl}`
                                    },
                                    {
                                        header: "VIDEO NOTE 🎙️ (240p)",
                                        title: "Download as Video Note",
                                        description: "Watch as note - 240p",
                                        id: `${sessionConfig.PREFIX}xtvnote ${lowUrl}`
                                    },
                                    {
                                        header: "DOCUMENT 📁 (360p)",
                                        title: "Download as Document",
                                        description: "Save as document",
                                        id: `${sessionConfig.PREFIX}xtvdoc ${highUrl}`
                                    }
                                ]
                            }]
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Open Video 🔗",
                            url: videoPageUrl
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` },
            { quoted: DEVELOPER_NEXUS_minibot }
        );
    }
    break;
}

case 'xtvvideo': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            caption: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Video error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'xtvnote': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            ptv: true
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Video note error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'xtvdoc': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            document: { url: videoUrl },
            mimetype: 'video/mp4',
            fileName: `DEVELOPER NEXUS _XNXXTV_${Date.now()}.mp4`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Document error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'xhamster':
case 'xham': {
    try {

        const q =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';

        const query = q.replace(/^\.(xhamster|xham)\s+/i, '').trim();

        if (!query) {
            return await socket.sendMessage(sender,
                { text: '*`Need Title or URL or Keyword`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        await socket.sendMessage(sender, { react: { text: '🔞', key: msg.key } });

        if (query.includes('xhamster.com')) {
            const dlRes = await axios.get(
                `https://www.movanest.xyz/v2/xhamdetail?url=${encodeURIComponent(query)}`,
                { timeout: 15000 }
            ).then(r => r.data).catch(() => null);

            if (!dlRes?.status || !dlRes?.results?.videoUrl) {
                return await socket.sendMessage(sender,
                    { text: '*`❌ Download failed`*' },
                    { quoted: DEVELOPER_NEXUS_minibot }
                );
            }

            const data = dlRes.results;
            const videoUrl = data.videoUrl;

            const bodyText = `*🔞 DEVELOPER NEXUS  XHAMSTER DOWNLOADER 🔞*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Title :\` ${data.title || 'N/A'}\n│ \`■ Views :\` ${data.viewCount || 'N/A'}\n│ \`■ Likes :\` ${data.likePercentage || 'N/A'}\n│ \`■ Tags :\` ${data.tags?.slice(0, 3).join(', ') || 'N/A'}\n╰━━━━━━━━━━━━━━━━━━●◌`;

            await socket.sendMessage(sender, {
                productMessage: {
                    title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ XHᴀᴍ Dʟ 🔞`,
                    description: "Select download format",
                    productId: "DEVELOPER NEXUS -XHAM-001",
                    retailerId: "DEVELOPER NEXUS -TEAM",
                    url: query,
                    body: bodyText,
                    footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                    priceAmount1000: 99999999900,
                    currencyCode: "LKR",
                    buttons: [
                        {
                            name: "single_select",
                            buttonParamsJson: JSON.stringify({
                                title: "Select Download Option",
                                sections: [{
                                    title: "Download Options",
                                    rows: [
                                        {
                                            header: "VIDEO 🎥",
                                            title: "Download as Video",
                                            description: "Best quality",
                                            id: `${sessionConfig.PREFIX}xhamvideo ${videoUrl}`
                                        },
                                        {
                                            header: "VIDEO NOTE 🎙️",
                                            title: "Download as Video Note",
                                            description: "Watch as note",
                                            id: `${sessionConfig.PREFIX}xhamnote ${videoUrl}`
                                        },
                                        {
                                            header: "DOCUMENT 📁",
                                            title: "Download as Document",
                                            description: "Save as document",
                                            id: `${sessionConfig.PREFIX}xhamdoc ${videoUrl}`
                                        }
                                    ]
                                }]
                            })
                        },
                        {
                            name: "cta_url",
                            buttonParamsJson: JSON.stringify({
                                display_text: "Open Video 🔗",
                                url: query
                            })
                        }
                    ]
                }
            }, { quoted: DEVELOPER_NEXUS_minibot });

            return await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
        }

        const searchRes = await axios.get(
            `https://www.movanest.xyz/v2/xhamsearch?query=${encodeURIComponent(query)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!searchRes?.status || !searchRes?.results?.length) {
            return await socket.sendMessage(sender,
                { text: '*`❌ No results found`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const videos = searchRes.results
            .filter(v =>
                v.url &&
                v.url.includes('xhamster.com/videos') &&
                v.thumbnail &&
                v.thumbnail.includes('http')
            )
            .slice(0, 10);

        if (!videos.length) {
            return await socket.sendMessage(sender,
                { text: '*`❌ No valid results found`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const rows = videos.map((v, i) => ({
            header: `${i + 1}. ⏱️ ${v.duration || 'N/A'}`,
            title: v.title?.slice(0, 60) || `Video ${i + 1}`,
            description: `👤 ${v.uploader || 'Unknown'}`,
            id: `${sessionConfig.PREFIX}xhamdl ${v.url}`
        }));

        const bodyText = `*🔞 DEVELOPER NEXUS  XHAMSTER SEARCH 🔞*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Query :\` ${query}\n│ \`■ Results :\` ${videos.length} videos found\n│ \`■ Select :\` Choose video below\n╰━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ XHᴀᴍ Sᴇᴀʀᴄʜ 🔞`,
                description: `Results for: ${query}`,
                thumbnail: { url: videos[0].thumbnail },
                productId: "DEVELOPER NEXUS -XHAM-SEARCH",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: `https://xhamster.com/search/${encodeURIComponent(query)}`,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "🔞 Select Video to Download",
                            sections: [{
                                title: `Search: "${query}" — ${videos.length} Results`,
                                rows: rows
                            }]
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Search on XHamster 🔗",
                            url: `https://xhamster.com/search/${encodeURIComponent(query)}`
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('XHamster Error:', e.message);
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` },
            { quoted: DEVELOPER_NEXUS_minibot }
        );
    }
    break;
}

case 'xhamdl': {
    try {
        const videoPageUrl = args.join(' ');
        if (!videoPageUrl) return;

        await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

        const dlRes = await axios.get(
            `https://www.movanest.xyz/v2/xhamdetail?url=${encodeURIComponent(videoPageUrl)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!dlRes?.status || !dlRes?.results?.videoUrl) {
            return await socket.sendMessage(sender,
                { text: '*`❌ Download failed`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const data = dlRes.results;
        const videoUrl = data.videoUrl;

        const bodyText = `*🔞 DEVELOPER NEXUS  XHAMSTER DOWNLOADER 🔞*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Title :\` ${data.title || 'N/A'}\n│ \`■ Views :\` ${data.viewCount || 'N/A'}\n│ \`■ Likes :\` ${data.likePercentage || 'N/A'}\n│ \`■ Tags :\` ${data.tags?.slice(0, 3).join(', ') || 'N/A'}\n╰━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ XHᴀᴍ Dʟ 🔞`,
                description: "Select download format",
                thumbnail: { url: `${sessionConfig.IMAGE}` },
                productId: "DEVELOPER NEXUS -XHAM-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: videoPageUrl,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "Select Download Option",
                            sections: [{
                                title: "Download Options",
                                rows: [
                                    {
                                        header: "VIDEO 🎥",
                                        title: "Download as Video",
                                        description: "Best quality",
                                        id: `${sessionConfig.PREFIX}xhamvideo ${videoUrl}`
                                    },
                                    {
                                        header: "VIDEO NOTE 🎙️",
                                        title: "Download as Video Note",
                                        description: "Watch as note",
                                        id: `${sessionConfig.PREFIX}xhamnote ${videoUrl}`
                                    },
                                    {
                                        header: "DOCUMENT 📁",
                                        title: "Download as Document",
                                        description: "Save as document",
                                        id: `${sessionConfig.PREFIX}xhamdoc ${videoUrl}`
                                    }
                                ]
                            }]
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Open Video 🔗",
                            url: videoPageUrl
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` },
            { quoted: DEVELOPER_NEXUS_minibot }
        );
    }
    break;
}

case 'xhamvideo': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            caption: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Video error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'xhamnote': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            ptv: true
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Video note error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'xhamdoc': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            document: { url: videoUrl },
            mimetype: 'video/mp4',
            fileName: `DEVELOPER NEXUS _XHamster_${Date.now()}.mp4`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Document error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'hentai':
case 'hnt': {
    try {
        const axios = require('axios');

        const q =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';

        const query = q.replace(/^\.(hentai|hnt)\s+/i, '').trim() || 'random';

        await socket.sendMessage(sender, { react: { text: '🔞', key: msg.key } });

        const searchRes = await axios.get(
            `https://www.movanest.xyz/v2/hentai?query=${encodeURIComponent(query)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!searchRes?.status || !searchRes?.result?.length) {
            return await socket.sendMessage(sender,
                { text: '*`❌ No results found`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const videos = searchRes.result.slice(0, 10);

        const rows = videos.map((v, i) => ({
            header: `${i + 1}. 🎌 ${v.category?.slice(0, 20) || 'Hentai'}`,
            title: v.title?.slice(0, 60) || `Video ${i + 1}`,
            description: `👁️ ${v.views_count || 'N/A'}`,
            id: `${sessionConfig.PREFIX}hntdl ${v.video_1}`
        }));

        const bodyText = `*🔞 DEVELOPER NEXUS  HENTAI SEARCH 🔞*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Query :\` ${query}\n│ \`■ Results :\` ${videos.length} videos found\n│ \`■ Select :\` Choose video below\n╰━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ Hᴇɴᴛᴀɪ Dʟ 🔞`,
                description: `Results for: ${query}`,
                thumbnail: { url: `${sessionConfig.IMAGE}` },
                productId: "DEVELOPER NEXUS -HNT-SEARCH",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: `https://sfmcompile.club`,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "🔞 Select Video to Download",
                            sections: [{
                                title: `Search: "${query}" — ${videos.length} Results`,
                                rows: rows
                            }]
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('Hentai Error:', e.message);
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` },
            { quoted: DEVELOPER_NEXUS_minibot }
        );
    }
    break;
}

case 'hntdl': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;

        await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

        const bodyText = `*🔞 DEVELOPER NEXUS  HENTAI DOWNLOADER 🔞*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Type :\` Hentai / SFM\n│ \`■ Source :\` sfmcompile.club\n╰━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ Hᴇɴᴛᴀɪ Dʟ 🔞`,
                description: "Select download format",
                thumbnail: { url: `${sessionConfig.IMAGE}` },
                productId: "DEVELOPER NEXUS -HNT-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: videoUrl,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "Select Download Option",
                            sections: [{
                                title: "Download Options",
                                rows: [
                                    {
                                        header: "VIDEO 🎥",
                                        title: "Download as Video",
                                        description: "MP4 format",
                                        id: `${sessionConfig.PREFIX}hntvideo ${videoUrl}`
                                    },
                                    {
                                        header: "VIDEO NOTE 🎙️",
                                        title: "Download as Video Note",
                                        description: "Watch as note",
                                        id: `${sessionConfig.PREFIX}hntnote ${videoUrl}`
                                    },
                                    {
                                        header: "DOCUMENT 📁",
                                        title: "Download as Document",
                                        description: "Save as document",
                                        id: `${sessionConfig.PREFIX}hntdoc ${videoUrl}`
                                    }
                                ]
                            }]
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Open Video 🔗",
                            url: videoUrl
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` },
            { quoted: DEVELOPER_NEXUS_minibot }
        );
    }
    break;
}

case 'hntvideo': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            caption: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Video error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'hntnote': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            ptv: true
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Video note error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'hntdoc': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            document: { url: videoUrl },
            mimetype: 'video/mp4',
            fileName: `DEVELOPER NEXUS _Hentai_${Date.now()}.mp4`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Document error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'twitter':
case 'tw':
case 'xtweet': {
    try {

        const q =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';

        const url = q.replace(/^\.(twitter|tw|xtweet)\s+/i, '').trim();

        if (!url || (!url.includes('x.com') && !url.includes('twitter.com'))) {
            return await socket.sendMessage(sender,
                { text: '*`Need X/Twitter URL`*\n📋 Example: .tw https://x.com/user/status/123' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        await socket.sendMessage(sender, { react: { text: '🐦', key: msg.key } });

        const res = await axios.get(
            `https://www.movanest.xyz/v2/ssstwitter?url=${encodeURIComponent(url)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.status || !res?.results?.url) {
            return await socket.sendMessage(sender,
                { text: '*`❌ Download failed`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const videoUrl = res.results.url;

        const bodyText = `*🐦 DEVELOPER NEXUS  TWITTER DOWNLOADER 🐦*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Source :\` X / Twitter\n│ \`■ URL :\` ${url.slice(0, 50)}...\n╰━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ Tᴡɪᴛᴛᴇʀ Dʟ 🐦`,
                description: "Select download format",
                thumbnail: { url: `${sessionConfig.IMAGE}` },
                productId: "DEVELOPER NEXUS -TW-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: url,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "Select Download Option",
                            sections: [{
                                title: "Download Options",
                                rows: [
                                    {
                                        header: "VIDEO 🎥",
                                        title: "Download as Video",
                                        description: "Best quality",
                                        id: `${sessionConfig.PREFIX}twvideo ${videoUrl}`
                                    },
                                    {
                                        header: "VIDEO NOTE 🎙️",
                                        title: "Download as Video Note",
                                        description: "Watch as note",
                                        id: `${sessionConfig.PREFIX}twnote ${videoUrl}`
                                    },
                                    {
                                        header: "DOCUMENT 📁",
                                        title: "Download as Document",
                                        description: "Save as document",
                                        id: `${sessionConfig.PREFIX}twdoc ${videoUrl}`
                                    }
                                ]
                            }]
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Open Tweet 🔗",
                            url: url
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('Twitter Error:', e.message);
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` },
            { quoted: DEVELOPER_NEXUS_minibot }
        );
    }
    break;
}

case 'twvideo': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            caption: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Video error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'twnote': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            ptv: true
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Video note error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'twdoc': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            document: { url: videoUrl },
            mimetype: 'video/mp4',
            fileName: `DEVELOPER NEXUS _Twitter_${Date.now()}.mp4`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Document error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'ringtone':
case 'ring': {
    try {

        const q =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';

        const query = q.replace(/^\.(ringtone|ring)\s+/i, '').trim();

        if (!query) {
            return await socket.sendMessage(sender,
                { text: '*`Need Ringtone Title or Keyword`*\n📋 Example: .ring apple' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        await socket.sendMessage(sender, { react: { text: '🎵', key: msg.key } });

        const searchRes = await axios.get(
            `https://www.movanest.xyz/v2/ringtone?title=${encodeURIComponent(query)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!searchRes?.status || !searchRes?.results?.length) {
            return await socket.sendMessage(sender,
                { text: '*`❌ No ringtones found`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const tones = searchRes.results.slice(0, 10);

        const rows = tones.map((t, i) => ({
            header: `🎵 ${i + 1}`,
            title: t.title?.slice(0, 60) || `Ringtone ${i + 1}`,
            description: 'Tap to download',
            id: `${sessionConfig.PREFIX}ringdl ${t.audio}`
        }));

        const bodyText = `*🎵 DEVELOPER NEXUS  RINGTONE SEARCH 🎵*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Query :\` ${query}\n│ \`■ Results :\` ${tones.length} ringtones found\n│ \`■ Select :\` Choose ringtone below\n╰━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ Rɪɴɢᴛᴏɴᴇ 🎵`,
                description: `Results for: ${query}`,
                thumbnail: { url: `${sessionConfig.IMAGE}` },
                productId: "DEVELOPER NEXUS -RING-SEARCH",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: `https://meloboom.com`,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "🎵 Select Ringtone",
                            sections: [{
                                title: `Search: "${query}" — ${tones.length} Results`,
                                rows: rows
                            }]
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('Ringtone Error:', e.message);
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` },
            { quoted: DEVELOPER_NEXUS_minibot }
        );
    }
    break;
}

case 'ringdl': {
    try {
        const audioUrl = args.join(' ');
        if (!audioUrl) return;

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        await socket.sendMessage(sender, {
            document: { url: audioUrl },
            mimetype: 'audio/mpeg',
            fileName: `DEVELOPER NEXUS _Ringtone_${Date.now()}.mp3`,
            caption: `*🎵 DEVELOPER NEXUS  RINGTONE DOWNLOADER 🎵*\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, {
            audio: { url: audioUrl },
            mimetype: 'audio/mpeg',
            ptt: false
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender,
            { text: `*❌ Download error:* \`${e.message}\`` },
            { quoted: DEVELOPER_NEXUS_minibot }
        );
    }
    break;
}

case 'douyin':
case 'dy': {
    try {


        const q =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';

        const query = q.replace(/^\.(douyin|dy)\s+/i, '').trim();

        if (!query) {
            return await socket.sendMessage(sender,
                { text: '*`Need Douyin URL or Keyword`*\n📋 Example: .dy cosplayer' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        await socket.sendMessage(sender, { react: { text: '🎵', key: msg.key } });

        if (query.includes('douyin.com') || query.includes('iesdouyin.com')) {
            return await socket.sendMessage(sender,
                { text: '*`❌ Direct URL download not supported. Use keyword search instead.`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const searchRes = await axios.get(
            `https://www.movanest.xyz/v2/douyin?q=${encodeURIComponent(query)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (searchRes?.status_code !== 0 || !searchRes?.data?.length) {
            return await socket.sendMessage(sender,
                { text: '*`❌ No results found`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const posts = searchRes.data
            .filter(item => item?.aweme_info)
            .slice(0, 10)
            .map(item => {
                const info = item.aweme_info;
                const isVideo = info.media_type === 1;
                const isImages = info.media_type === 2;

                const videoUrl = isVideo
                    ? info.video?.play_addr?.url_list?.[0]
                    : null;

                const firstImageUrl = isImages
                    ? info.images?.[0]?.url_list?.[0]
                    : null;

                const thumbnail = isVideo
                    ? info.video?.cover?.url_list?.[0]
                    : firstImageUrl;

                const stats = info.statistics;
                const likes = stats?.digg_count || 0;
                const comments = stats?.comment_count || 0;

                const desc = info.desc?.slice(0, 60) || 'Douyin Video';

                const author = info.author?.nickname || 'Unknown';

                const shareUrl = info.share_info?.share_url || '';

                const awemeId = info.aweme_id;

                return {
                    desc, author, thumbnail, videoUrl,
                    firstImageUrl, isVideo, isImages,
                    likes, comments, shareUrl, awemeId,
                    imageCount: isImages ? (info.images?.length || 0) : 0
                };
            })
            .filter(p => p.videoUrl || p.firstImageUrl); 

        if (!posts.length) {
            return await socket.sendMessage(sender,
                { text: '*`❌ No downloadable content found`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }


        const rows = posts.map((p, i) => ({
            header: p.isVideo
                ? `🎥 ${i + 1} | ❤️ ${p.likes.toLocaleString()}`
                : `🖼️ ${i + 1} | ${p.imageCount} photos | ❤️ ${p.likes.toLocaleString()}`,
            title: p.desc.slice(0, 60),
            description: `👤 ${p.author}`,
            id: p.isVideo
                ? `${sessionConfig.PREFIX}dydl ${p.videoUrl}`
                : `${sessionConfig.PREFIX}dyimg ${p.awemeId}|||${p.firstImageUrl}` 
        }));

        const bodyText = `*🎵 DEVELOPER NEXUS  DOUYIN SEARCH 🎵*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Query :\` ${query}\n│ \`■ Results :\` ${posts.length} posts found\n│ \`■ Select :\` Choose post below\n╰━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ Dᴏᴜʏɪɴ 🎵`,
                description: `Results for: ${query}`,
                thumbnail: { url: posts[0].thumbnail },
                productId: "DEVELOPER NEXUS -DY-SEARCH",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: `https://www.douyin.com`,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "🎵 Select Douyin Post",
                            sections: [{
                                title: `Search: "${query}" — ${posts.length} Results`,
                                rows: rows
                            }]
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('Douyin Error:', e.message);
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` },
            { quoted: DEVELOPER_NEXUS_minibot }
        );
    }
    break;
}

case 'dydl': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ Dᴏᴜʏɪɴ Dʟ 🎵`,
                description: "Select download format",
                thumbnail: { url: `${sessionConfig.IMAGE}` },
                productId: "DEVELOPER NEXUS -DY-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: "https://www.douyin.com",
                body: `*🎵 DEVELOPER NEXUS  DOUYIN DOWNLOADER 🎵*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Source :\` Douyin\n│ \`■ Select :\` Format below\n╰━━━━━━━━━━━━━━━━━━●◌`,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "Select Format",
                            sections: [{
                                title: "Download Options",
                                rows: [
                                    {
                                        header: "VIDEO 🎥",
                                        title: "Download as Video",
                                        description: "Best quality",
                                        id: `${sessionConfig.PREFIX}dyvideo ${videoUrl}`
                                    },
                                    {
                                        header: "VIDEO NOTE 🎙️",
                                        title: "Download as Video Note",
                                        description: "Watch as note",
                                        id: `${sessionConfig.PREFIX}dynote ${videoUrl}`
                                    },
                                    {
                                        header: "DOCUMENT 📁",
                                        title: "Download as Document",
                                        description: "Save as document",
                                        id: `${sessionConfig.PREFIX}dydoc ${videoUrl}`
                                    }
                                ]
                            }]
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'dyimg': {
    try {
        const input = args.join(' ');
        if (!input) return;

        const [awemeId, ...rest] = input.split('|||');
        const firstImg = rest.join('|||');

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        await socket.sendMessage(sender, {
            image: { url: firstImg },
            caption: `*🎵 Douyin Image*\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'dyvideo': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            caption: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Video error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'dynote': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            ptv: true
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Note error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'dydoc': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            document: { url: videoUrl },
            mimetype: 'video/mp4',
            fileName: `DEVELOPER NEXUS _Douyin_${Date.now()}.mp4`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Doc error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case '8font':
case 'font': {
    try {

        const q = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '');
        const query = q.replace(/^\.(8font|font)\s+/i, '').trim();

        if (!query) return await socket.sendMessage(sender,
            { text: '*`Need Font Name or Style`*\n📋 Example: .font cartoon' }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '🔤', key: msg.key } });

        const res = await axios.get(
            `https://www.movanest.xyz/v2/8font?query=${encodeURIComponent(query)}&page=1`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.status || !res?.results?.length)
            return await socket.sendMessage(sender, { text: '*`❌ No fonts found`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const fonts = res.results.slice(0, 10);

        const first = fonts[0];
        await socket.sendMessage(sender, {
            image: { url: first.image },
            caption: `*🔤 DEVELOPER NEXUS  FONT SEARCH 🔤*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Query :\` ${query}\n│ \`■ Found :\` ${fonts.length} fonts\n╰━━━━━━━━━━━━━━━━━━●◌\n\n${fonts.map((f, i) => `${i + 1}. ${f.title}`).join('\n')}\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        for (let i = 0; i < Math.min(fonts.length, 10); i++) {
            await socket.sendMessage(sender, {
                image: { url: fonts[i].image },
                caption: `*${i + 1}. ${fonts[i].title}*\n🏷️ ${fonts[i].categories?.join(', ') || 'N/A'}\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
            });
        }

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'pinterest':
case 'pin': {
    try {

        const q = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '');
        const query = q.replace(/^\.(pinterest|pin)\s+/i, '').trim();

        if (!query) return await socket.sendMessage(sender,
            { text: '*`Need Search Query`*\n📋 Example: .pin cute puppies' }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '📌', key: msg.key } });

        const res = await axios.get(
            `https://www.movanest.xyz/v2/pinterest?query=${encodeURIComponent(query)}&pageSize=10`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.status || !res?.results?.length)
            return await socket.sendMessage(sender, { text: '*`❌ No images found`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const images = res.results.filter(r => r.image && !r.is_video).slice(0, 20);

        if (!images.length)
            return await socket.sendMessage(sender, { text: '*`❌ No valid images`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        for (const img of images) {
            await socket.sendMessage(sender, {
                image: { url: img.image },
                caption: `📌 *${img.title?.slice(0, 80) || 'Pinterest'}*\n👤 ${img.full_name || img.username || 'N/A'}\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'wallpaper':
case 'wp': {
    try {
        const q = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '');
        const query = q.replace(/^\.(wallpaper|wp)\s+/i, '').trim();

        if (!query) return await socket.sendMessage(sender,
            { text: '*`Need Search Query`*\n📋 Example: .wp nature landscapes' }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '🖼️', key: msg.key } });

        const res = await axios.get(
            `https://www.movanest.xyz/v2/wallpaper?name=${encodeURIComponent(query)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.status || !res?.results?.length)
            return await socket.sendMessage(sender, { text: '*`❌ No wallpapers found`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const walls = res.results.slice(0, 10);

        for (const w of walls) {
            await socket.sendMessage(sender, {
                image: { url: w.imageUrl },
                caption: `🖼️ *${w.title?.slice(0, 80) || 'Wallpaper'}*\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
            });
        }

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'gimg':
case 'googleimage':
case 'google': {
    try {
        const q = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '');
        const query = q.replace(/^\.(gimg|googleimage|google)\s+/i, '').trim();

        if (!query) return await socket.sendMessage(sender,
            { text: '*`Need Search Query`*\n📋 Example: .gimg cute cats' }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

        const res = await axios.get(
            `https://www.movanest.xyz/v2/googleimage?query=${encodeURIComponent(query)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.status || !res?.results?.images?.length)
            return await socket.sendMessage(sender, { text: '*`❌ No images found`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const images = res.results.images.slice(0, 10);

        for (const img of images) {
            try {
                await socket.sendMessage(sender, {
                    image: { url: img.url },
                    caption: `🔍 *${query}*\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
                });
            } catch {}
        }

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'ytsearch':
case 'yts': {
    try {
        const q = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '');
        const query = q.replace(/^\.(ytsearch|yts)\s+/i, '').trim();

        if (!query) return await socket.sendMessage(sender,
            { text: '*`Need Search Query`*\n📋 Example: .yts lelena' }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '▶️', key: msg.key } });

        const res = await axios.get(
            `https://www.movanest.xyz/v2/ytsearch?query=${encodeURIComponent(query)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.status || !res?.results?.length)
            return await socket.sendMessage(sender, { text: '*`❌ No results`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const videos = res.results
            .filter(r => r.type === 'video' && r.url && r.title)
            .slice(0, 20);

        if (!videos.length)
            return await socket.sendMessage(sender, { text: '*`❌ No videos found`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const fmtViews = (v) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(1)}K` : String(v);

        const rows = videos.map((v, i) => ({
            header: `▶️ ${i + 1} | ⏱️ ${v.timestamp || 'N/A'} | 👁️ ${fmtViews(v.views || 0)}`,
            title: v.title.slice(0, 60),
            description: `👤 ${v.author?.name || 'N/A'} | ${v.ago || ''}`,
            id: `${sessionConfig.PREFIX}ytdl ${v.url}`
        }));

        const thumbnail = videos[0]?.thumbnail;
        const bodyText = `*▶️ DEVELOPER NEXUS  YOUTUBE SEARCH ▶️*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Query :\` ${query}\n│ \`■ Results :\` ${videos.length} videos\n╰━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ YT Sᴇᴀʀᴄʜ ▶️`,
                description: `Results for: ${query}`,
                ...(thumbnail && { thumbnail: { url: thumbnail } }),
                productId: "DEVELOPER NEXUS -YTS-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: `https://youtube.com/results?search_query=${encodeURIComponent(query)}`,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [{
                    name: "single_select",
                    buttonParamsJson: JSON.stringify({
                        title: "▶️ Select Video",
                        sections: [{ title: `"${query}" — ${videos.length} Results`, rows }]
                    })
                }, {
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({
                        display_text: "Search on YouTube 🔗",
                        url: `https://youtube.com/results?search_query=${encodeURIComponent(query)}`
                    })
                }]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'ytdl': {
    try {
        const videoUrl = args.join(' ').trim();

        if (!videoUrl || !videoUrl.includes('youtube.com'))
            return await socket.sendMessage(sender,
                { text: '*`❌ Invalid YouTube URL`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender,
            { text: '*`⏳ Fetching YouTube download...`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const res = await axios.get(
            `https://DEVELOPER NEXUS -download-api.vercel.app/api/download/ytmp3?url=${encodeURIComponent(videoUrl)}`,
            { timeout: 30000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.status || !res?.data?.url)
            return await socket.sendMessage(sender,
                { text: '*`❌ YouTube download failed`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const { title, url: dlUrl } = res.data;

        const bodyText = `*▶️ DEVELOPER NEXUS  YOUTUBE DOWNLOADER ▶️*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Title :\` ${(title || 'N/A').slice(0, 60)}\n│ \`■ Select :\` Format below\n╰━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ YT Dʟ ▶️`,
                description: (title || 'YouTube').slice(0, 60),
                thumbnail: { url: `${sessionConfig.IMAGE}` },
                productId: "DEVELOPER NEXUS -YTDL-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: videoUrl,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [{
                    name: "single_select",
                    buttonParamsJson: JSON.stringify({
                        title: "Select Format",
                        sections: [{
                            title: "Download Options",
                            rows: [
                                {
                                    header: "🎵 AUDIO",
                                    title: "Download as Audio",
                                    description: "MP3 format",
                                    id: `${sessionConfig.PREFIX}ytaudio ${dlUrl}|||${title}`
                                },
                                {
                                    header: "🎵 AUDIO NOTE",
                                    title: "Send as Audio Note",
                                    description: "Voice message style",
                                    id: `${sessionConfig.PREFIX}ytptt ${dlUrl}`
                                },
                                {
                                    header: "📁 DOCUMENT",
                                    title: "Download as Document",
                                    description: "Save as file",
                                    id: `${sessionConfig.PREFIX}ytdoc ${dlUrl}|||${title}`
                                }
                            ]
                        }]
                    })
                }, {
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({
                        display_text: "Open on YouTube 🔗",
                        url: videoUrl
                    })
                }]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'ytaudio': {
    try {
        const input = args.join(' ');
        const [dlUrl, ...rest] = input.split('|||');
        const title = rest.join('|||') || `DEVELOPER NEXUS _YouTube_${Date.now()}`;

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        await socket.sendMessage(sender, {
            audio: { url: dlUrl },
            mimetype: 'audio/mp4',
            ptt: false
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'ytptt': {
    try {
        const dlUrl = args.join(' ');
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        await socket.sendMessage(sender, {
            audio: { url: dlUrl },
            mimetype: 'audio/mp4',
            ptt: true
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'ytdoc': {
    try {
        const input = args.join(' ');
        const [dlUrl, ...rest] = input.split('|||');
        const title = rest.join('|||') || `DEVELOPER NEXUS _YouTube_${Date.now()}`;

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        await socket.sendMessage(sender, {
            document: { url: dlUrl },
            mimetype: 'audio/mp4',
            fileName: `${title.slice(0, 50)}.mp4`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'ttsearch':
case 'tiktoksearch': {
    try {
        const q = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '');
        const query = q.replace(/^\.(ttsearch|tts)\s+/i, '').trim();

        if (!query) return await socket.sendMessage(sender,
            { text: '*`Need Search Query`*\n📋 Example: .tts funny' }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '🎵', key: msg.key } });

        const res = await axios.get(
            `https://www.movanest.xyz/v2/tiktoksearch?query=${encodeURIComponent(query)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.status || !res?.results?.length)
            return await socket.sendMessage(sender, { text: '*`❌ No results`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const videos = res.results.slice(0, 20);

        const fmtNum = (n) => n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}K` : String(n);
        const fmtDur = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

        const rows = videos.map((v, i) => ({
            header: `🎵 ${i + 1} | ⏱️ ${fmtDur(v.duration)} | ❤️ ${fmtNum(v.digg_count)}`,
            title: (v.title || 'TikTok Video').slice(0, 60),
            description: `👤 ${v.author?.nickname || 'N/A'}`,
            id: `${sessionConfig.PREFIX}ttdl ${v.play}`
        }));

        const thumbnail = videos[0]?.cover;
        const bodyText = `*🎵 DEVELOPER NEXUS  TIKTOK SEARCH 🎵*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Query :\` ${query}\n│ \`■ Results :\` ${videos.length} videos\n╰━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ TT Sᴇᴀʀᴄʜ 🎵`,
                description: `Results for: ${query}`,
                ...(thumbnail && { thumbnail: { url: thumbnail } }),
                productId: "DEVELOPER NEXUS -TTS-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [{
                    name: "single_select",
                    buttonParamsJson: JSON.stringify({
                        title: "🎵 Select Video",
                        sections: [{ title: `"${query}" — ${videos.length} Results`, rows }]
                    })
                }]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'ttdl': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ TT Dʟ 🎵`,
                description: "Select format",
                thumbnail: { url: `${sessionConfig.IMAGE}` },
                productId: "DEVELOPER NEXUS -TT-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: "https://www.tiktok.com",
                body: `*🎵 TIKTOK DOWNLOAD 🎵*`,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [{
                    name: "single_select",
                    buttonParamsJson: JSON.stringify({
                        title: "Select Format",
                        sections: [{ title: "Options", rows: [
                            { header: "VIDEO 🎥", title: "Download as Video", id: `${sessionConfig.PREFIX}ttvideo ${videoUrl}` },
                            { header: "VIDEO NOTE 🎙️", title: "As Video Note", id: `${sessionConfig.PREFIX}ttnote ${videoUrl}` },
                            { header: "DOCUMENT 📁", title: "As Document", id: `${sessionConfig.PREFIX}ttdoc ${videoUrl}` }
                        ]}]
                    })
                }]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) { await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot }); }
    break;
}

case 'ttvideo': {
    try {
        const url = args.join(' ');
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, { video: { url }, mimetype: 'video/mp4', caption: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*` }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) { await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot }); }
    break;
}
case 'ttnote': {
    try {
        const url = args.join(' ');
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, { video: { url }, mimetype: 'video/mp4', ptv: true }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) { await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot }); }
    break;
}
case 'ttdoc': {
    try {
        const url = args.join(' ');
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, { document: { url }, mimetype: 'video/mp4', fileName: `DEVELOPER NEXUS _TikTok_${Date.now()}.mp4` }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) { await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot }); }
    break;
}

case 'quote': {
    try {
        await socket.sendMessage(sender, { react: { text: '💬', key: msg.key } });

        const res = await axios.get('https://www.movanest.xyz/v2/quote', { timeout: 10000 })
            .then(r => r.data).catch(() => null);

        if (!res?.status || !res?.results?.length)
            return await socket.sendMessage(sender, { text: '*`❌ Failed to get quote`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const pick = res.results[Math.floor(Math.random() * res.results.length)];

        await socket.sendMessage(sender, {
            text: `*💬 DEVELOPER NEXUS  QUOTE OF THE DAY 💬*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ ${pick.quote}\n│ \`— ${pick.author}\`\n│ 🏷️ ${pick.tags?.join(', ') || 'N/A'}\n╰━━━━━━━━━━━━━━━━━━●◌\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'sinhalanda':
case 'sld': {
    try {
        const q = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '');
        const query = q.replace(/^\.(sinhalanda|sld)\s+/i, '').trim();

        if (!query) return await socket.sendMessage(sender,
            { text: '*`Need Song Title`*\n📋 Example: .sld lelena' }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '🎵', key: msg.key } });

        const res = await axios.get(
            `https://DEVELOPER NEXUS -download-api.vercel.app/api/download/sinhalanda?query=${encodeURIComponent(query)}`,
            { timeout: 20000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.status || !res?.data?.length)
            return await socket.sendMessage(sender, { text: '*`❌ No songs found`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const songs = res.data.slice(0, 10);

        const cleanTitle = (t) => t.replace(/^\d+\.\s*/,'').replace('.mp3','').trim();

        const rows = songs.map((s, i) => ({
            header: `🎵 ${i + 1} | 💾 ${s.size}`,
            title: cleanTitle(s.title).slice(0, 60),
            description: s.size,
            id: `${sessionConfig.PREFIX}slddl ${s.download}|||${cleanTitle(s.title)}`
        }));

        const thumbnail = songs[0]?.image;
        const bodyText = `*🎵 DEVELOPER NEXUS  SINHALA SONG SEARCH 🎵*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Query :\` ${query}\n│ \`■ Results :\` ${songs.length} songs found\n╰━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ Sɪɴʜᴀʟᴀ Sᴏɴɢ 🎵`,
                description: `Results for: ${query}`,
                ...(thumbnail && { thumbnail: { url: thumbnail } }),
                productId: "DEVELOPER NEXUS -SLD-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: "https://sinhanada.net",
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [{
                    name: "single_select",
                    buttonParamsJson: JSON.stringify({
                        title: "🎵 Select Song",
                        sections: [{
                            title: `"${query}" — ${songs.length} Results`,
                            rows
                        }]
                    })
                }, {
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({
                        display_text: "Open SinhaNada 🔗",
                        url: "https://sinhanada.net"
                    })
                }]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'slddl': {
    try {
        const input = args.join(' ');
        const [dlUrl, ...rest] = input.split('|||');
        const songTitle = rest.join('|||') || `DEVELOPER NEXUS _Sinhala_${Date.now()}`;

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        await socket.sendMessage(sender, {
            audio: { url: dlUrl },
            mimetype: 'audio/mpeg',
            ptt: false
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, {
            document: { url: dlUrl },
            mimetype: 'audio/mpeg',
            fileName: `${songTitle}.mp3`,
            caption: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'fancytext':
case 'fancy': {
    try {
        const q = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '');
        const word = q.replace(/^\.(fancytext|fancy)\s+/i, '').trim();

        if (!word) return await socket.sendMessage(sender,
            { text: '*`Need a word or name`*\n📋 Example: .fancy DarkBot' }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✨', key: msg.key } });

        const res = await axios.get(
            `https://www.movanest.xyz/v2/fancytext?word=${encodeURIComponent(word)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.status || !res?.results?.length)
            return await socket.sendMessage(sender, { text: '*`❌ Fancy text failed`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const styles = res.results;

        const preview = styles.slice(0, 30).map((s, i) =>
            `${String(i+1).padStart(2, '0')}. ${s}`
        ).join('\n');

        await socket.sendMessage(sender, {
            text: `*✨ DEVELOPER NEXUS  FANCY TEXT ✨*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Word :\` ${word}\n│ \`■ Styles :\` ${styles.length} available\n╰━━━━━━━━━━━━━━━━━━●◌\n\n${preview}\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        if (styles.length > 30) {
            const more = styles.slice(30).map((s, i) =>
                `${String(i+31).padStart(2, '0')}. ${s}`
            ).join('\n');
            await socket.sendMessage(sender, {
                text: `*✨ MORE STYLES ✨*\n\n${more}`
            });
        }

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'bbcnews':
case 'bbc': {
    try {

        const q = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '');
        const limitArg = parseInt(q.replace(/^\.(bbcnews|bbc)\s*/i, '').trim()) || 5;
        const limit = Math.min(limitArg, 10);

        await socket.sendMessage(sender, { react: { text: '📰', key: msg.key } });

        const res = await axios.get(
            `https://www.movanest.xyz/v2/bbc-news?limit=${limit}`,
            { timeout: 20000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.status || !res?.results?.length)
            return await socket.sendMessage(sender, { text: '*`❌ BBC News fetch failed`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const news = res.results;
        const fmtDate = (d) => {
            try { return new Date(d).toLocaleDateString('en-US', { day:'numeric', month:'short', year:'numeric' }); }
            catch { return d; }
        };

        for (const item of news) {
            const caption = `*📰 BBC NEWS*\n\n*${item.title}*\n\n${item.description || ''}\n\n📅 ${fmtDate(item.uploadedDate)}\n🔗 ${item.link}`;
            try {
                if (item.thumbnail) {
                    await socket.sendMessage(sender, {
                        image: { url: item.thumbnail },
                        caption: caption
                    });
                } else {
                    await socket.sendMessage(sender, { text: caption });
                }
            } catch {
                await socket.sendMessage(sender, { text: caption });
            }
            await new Promise(r => setTimeout(r, 500));
        }

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'intlnews':
case 'worldnews': {
    try {

        const q = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '');
        const raw = q.replace(/^\.(intlnews|worldnews)\s*/i, '').trim();

        const validCats = ['international','technology','anime','south-asian','sri-lankan'];
        const category = validCats.includes(raw) ? raw : 'international';

        await socket.sendMessage(sender, { react: { text: '🌍', key: msg.key } });

        const res = await axios.get(
            `https://www.movanest.xyz/v2/news/fetchfromcategory?category=${category}&numSites=10`,
            { timeout: 30000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.status || !res?.results?.length)
            return await socket.sendMessage(sender, { text: '*`❌ News fetch failed`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, {
            text: `*🌍 DEVELOPER NEXUS  ${category.toUpperCase()} NEWS 🌍*\n> Fetching from top sources...`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        for (const item of res.results) {
            if (!item.title) continue;
            const caption = `*📰 ${item.site || 'News'}*\n\n*${item.title}*\n\n${(item.description || '').slice(0, 200)}${item.description?.length > 200 ? '...' : ''}\n\n🔗 ${item.url || ''}`;
            try {
                if (item.image && item.image.startsWith('http')) {
                    await socket.sendMessage(sender, {
                        image: { url: item.image },
                        caption
                    });
                } else {
                    await socket.sendMessage(sender, { text: caption });
                }
            } catch {
                await socket.sendMessage(sender, { text: caption });
            }
            await new Promise(r => setTimeout(r, 500));
        }

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}


case 'slnews': {
    try {

        await socket.sendMessage(sender, { react: { text: '🇱🇰', key: msg.key } });

        const [newfirst, lankadeepa, gagana] = await Promise.allSettled([
            axios.get('https://api-new-DEVELOPER NEXUS .vercel.app/api/news/newfirst', { timeout: 15000 }).then(r => r.data),
            axios.get('https://api-new-DEVELOPER NEXUS .vercel.app/api/news/lankadeepa', { timeout: 15000 }).then(r => r.data),
            axios.get('https://api-new-DEVELOPER NEXUS .vercel.app/api/news/gagana', { timeout: 15000 }).then(r => r.data),
        ]);

        const sources = [
            { name: '📺 NewsFIRST', result: newfirst },
            { name: '📰 Lankadeepa', result: lankadeepa },
            { name: '📰 Gagana', result: gagana },
        ];

        let sent = 0;

        for (const src of sources) {
            if (src.result.status !== 'fulfilled') continue;
            const data = src.result.value?.data;
            if (!data?.title) continue;

            const caption = `*${src.name}*\n\n*${data.title}*\n\n${(data.desc || '').slice(0, 250)}${data.desc?.length > 250 ? '...' : ''}\n\n📅 ${data.date || ''}\n🔗 ${data.url || ''}`;

            try {
                if (data.image) {
                    await socket.sendMessage(sender, {
                        image: { url: data.image },
                        caption
                    });
                } else {
                    await socket.sendMessage(sender, { text: caption });
                }
            } catch {
                await socket.sendMessage(sender, { text: caption });
            }

            sent++;
            await new Promise(r => setTimeout(r, 500));
        }

        if (!sent)
            return await socket.sendMessage(sender, { text: '*`❌ No SL news available`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'news2': {
    try {
        const q = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '');
        const site = q.replace(/^\.news\s+/i, '').trim().toLowerCase();


        const categories = {
            'international': ['bbc','cnn','aljazeera','reuters','guardian'],
            'technology': ['techcrunch','theverge','wired','engadget','gizmodo'],
            'anime': ['animenewsnetwork','crunchyrollnews','myanimelistnews'],
            'south-asian': ['timesofindia','hindustantimes','dawn','straitstimes'],
            'sri-lankan': ['esana','gagana','newsfirst','lankadeepa','ada','hiru','diwaina']
        };

        if (!site) {
            const catList = Object.entries(categories).map(([cat, sites]) =>
                `\`${cat}\`: ${sites.slice(0,3).join(', ')}...`
            ).join('\n');

            return await socket.sendMessage(sender, {
                text: `*📰 DEVELOPER NEXUS  NEWS COMMAND 📰*\n\nUsage: *.news <category>*\n\n*Categories:*\n${catList}\n\n📋 Example:\n.news international\n.news technology\n.news sri-lankan`
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        await socket.sendMessage(sender, { react: { text: '📰', key: msg.key } });

        const res = await axios.get(
            `https://www.movanest.xyz/v2/news/fetchfromcategory?category=${encodeURIComponent(site)}&numSites=10`,
            { timeout: 30000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.status || !res?.results?.length)
            return await socket.sendMessage(sender, { text: `*\`❌ No news for category: ${site}\`\n\n*📰 DEVELOPER NEXUS  NEWS COMMAND 📰*\n\nUsage: *.news <category>*\n\n*Categories:*\n${catList}\n\n📋 Example:\n.news international\n.news technology\n.news sri-lankan*` }, { quoted: DEVELOPER_NEXUS_minibot });

        for (const item of res.results) {
            if (!item.title) continue;
            const caption = `*📰 ${item.site}*\n\n*${item.title}*\n\n${(item.description || '').slice(0, 200)}${(item.description?.length || 0) > 200 ? '...' : ''}\n\n🔗 ${item.url || ''}`;
            try {
                if (item.image?.startsWith('http')) {
                    await socket.sendMessage(sender, { image: { url: item.image }, caption });
                } else {
                    await socket.sendMessage(sender, { text: caption });
                }
            } catch {
                await socket.sendMessage(sender, { text: caption });
            }
            await new Promise(r => setTimeout(r, 600));
        }

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'derana': {
    try {
        await socket.sendMessage(sender, { react: { text: '📺', key: msg.key } });
        await socket.sendMessage(sender,
            { text: '*`⏳ Fetching Ada Derana news...`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const res = await axios.get(
            `https://api-new-DEVELOPER NEXUS .vercel.app/api/news/derana`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.data?.length)
            return await socket.sendMessage(sender,
                { text: '*`❌ No news found`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const news = res.data.slice(0, 5);

        for (const item of news) {
            const caption = `*📺 Ada Derana*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ *${item.title || 'N/A'}*\n│\n│ ${item.desc || ''}\n│\n│ 🗓️ ${item.date || 'N/A'}\n│ 🔗 ${item.url || ''}\n╰━━━━━━━━━━━━━━━━━━●◌\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

            try {
                if (item.image) {
                    await socket.sendMessage(sender, {
                        image: { url: item.image },
                        caption
                    }, { quoted: DEVELOPER_NEXUS_minibot });
                } else {
                    await socket.sendMessage(sender,
                        { text: caption }, { quoted: DEVELOPER_NEXUS_minibot });
                }
            } catch {
                await socket.sendMessage(sender,
                    { text: caption }, { quoted: DEVELOPER_NEXUS_minibot });
            }

            await new Promise(r => setTimeout(r, 500));
        }

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'lankadeepa': {
    try {
        await socket.sendMessage(sender, { react: { text: '📰', key: msg.key } });
        await socket.sendMessage(sender,
            { text: '*`⏳ Fetching Lankadeepa news...`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const res = await axios.get(
            `https://api-new-DEVELOPER NEXUS .vercel.app/api/news/lankadeepa`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.data?.length)
            return await socket.sendMessage(sender,
                { text: '*`❌ No news found`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const news = res.data.slice(0, 5);

        for (const item of news) {
            const caption = `*📰 Lankadeepa*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ *${item.title || 'N/A'}*\n│\n│ ${item.desc || ''}\n│\n│ 🗓️ ${item.date || 'N/A'}\n│ 🔗 ${item.url || ''}\n╰━━━━━━━━━━━━━━━━━━●◌\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

            try {
                if (item.image) {
                    await socket.sendMessage(sender, {
                        image: { url: item.image },
                        caption
                    }, { quoted: DEVELOPER_NEXUS_minibot });
                } else {
                    await socket.sendMessage(sender,
                        { text: caption }, { quoted: DEVELOPER_NEXUS_minibot });
                }
            } catch {
                await socket.sendMessage(sender,
                    { text: caption }, { quoted: DEVELOPER_NEXUS_minibot });
            }

            await new Promise(r => setTimeout(r, 500));
        }

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'gagana': {
    try {
        await socket.sendMessage(sender, { react: { text: '📰', key: msg.key } });
        await socket.sendMessage(sender,
            { text: '*`⏳ Fetching Gagana news...`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const res = await axios.get(
            `https://api-new-DEVELOPER NEXUS .vercel.app/api/news/gagana`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.data?.length)
            return await socket.sendMessage(sender,
                { text: '*`❌ No news found`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const news = res.data.slice(0, 5);

        for (const item of news) {
            const caption = `*📰 Gagana*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ *${item.title || 'N/A'}*\n│\n│ ${item.desc || ''}\n│\n│ 🗓️ ${item.date || 'N/A'}\n│ 🔗 ${item.url || ''}\n╰━━━━━━━━━━━━━━━━━━●◌\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

            try {
                if (item.image) {
                    await socket.sendMessage(sender, {
                        image: { url: item.image },
                        caption
                    }, { quoted: DEVELOPER_NEXUS_minibot });
                } else {
                    await socket.sendMessage(sender,
                        { text: caption }, { quoted: DEVELOPER_NEXUS_minibot });
                }
            } catch {
                await socket.sendMessage(sender,
                    { text: caption }, { quoted: DEVELOPER_NEXUS_minibot });
            }

            await new Promise(r => setTimeout(r, 500));
        }

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'newsfirst': {
    try {
        await socket.sendMessage(sender, { react: { text: '📺', key: msg.key } });
        await socket.sendMessage(sender,
            { text: '*`⏳ Fetching NewsFirst news...`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const res = await axios.get(
            `https://api-new-DEVELOPER NEXUS .vercel.app/api/news/newfirst`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.data?.length)
            return await socket.sendMessage(sender,
                { text: '*`❌ No news found`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const news = res.data.slice(0, 5);

        for (const item of news) {
            const caption = `*📺 NewsFirst*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ *${item.title || 'N/A'}*\n│\n│ ${item.desc || ''}\n│\n│ 🗓️ ${item.date || 'N/A'}\n│ 🔗 ${item.url || ''}\n╰━━━━━━━━━━━━━━━━━━●◌\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

            try {
                if (item.image) {
                    await socket.sendMessage(sender, {
                        image: { url: item.image },
                        caption
                    }, { quoted: DEVELOPER_NEXUS_minibot });
                } else {
                    await socket.sendMessage(sender,
                        { text: caption }, { quoted: DEVELOPER_NEXUS_minibot });
                }
            } catch {
                await socket.sendMessage(sender,
                    { text: caption }, { quoted: DEVELOPER_NEXUS_minibot });
            }

            await new Promise(r => setTimeout(r, 500));
        }

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'newslist':
case 'newssites': {
    try {
        await socket.sendMessage(sender, { react: { text: '📋', key: msg.key } });

        const res = await axios.get(
            `https://www.movanest.xyz/v2/news/allsites`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.status || !res?.results?.length)
            return await socket.sendMessage(sender,
                { text: '*`❌ Failed to fetch sites`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const sites = res.results;
        const total = res.count || sites.length;

        const chunkSize = 30;
        const chunks = [];
        for (let i = 0; i < sites.length; i += chunkSize) {
            chunks.push(sites.slice(i, i + chunkSize));
        }

        for (let i = 0; i < chunks.length; i++) {
            const list = chunks[i].map((s, j) =>
                `┋ *${i * chunkSize + j + 1}.* \`${s}\``
            ).join('\n');

            const msg_text = `*📋 DEVELOPER NEXUS  News Sites (${i * chunkSize + 1}-${Math.min((i + 1) * chunkSize, total)} / ${total})*\n╭━━━━━━━━━━━━━━━━━━●◌\n${list}\n╰━━━━━━━━━━━━━━━━━━●◌\n\n📌 *Usage:* \`${sessionConfig.PREFIX}news <sitename>\`\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

            await socket.sendMessage(sender,
                { text: msg_text }, { quoted: DEVELOPER_NEXUS_minibot });

            await new Promise(r => setTimeout(r, 500));
        }

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'newscats':
case 'newscategories': {
    try {
        await socket.sendMessage(sender, { react: { text: '📂', key: msg.key } });

        const res = await axios.get(
            `https://www.movanest.xyz/v2/news/categories`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.status || !res?.results)
            return await socket.sendMessage(sender,
                { text: '*`❌ Failed to fetch categories`*' }, { quoted: DEVELOPER_NEXUS_minibot });

        const cats = res.results;
        const catNames = Object.keys(cats);

        const catList = catNames.map((cat, i) => {
            const siteList = (cats[cat] || []).slice(0, 5).join(', ');
            return `┋ *${i + 1}. ${cat}*\n┋  📌 ${siteList}${cats[cat].length > 5 ? ` +${cats[cat].length - 5} more` : ''}`;
        }).join('\n┇\n');

        const message = `*📂 DEVELOPER NEXUS  News Categories*\n╭━━━━━━━━━━━━━━━━━━●◌\n┇\n${catList}\n┇\n╰━━━━━━━━━━━━━━━━━━●◌\n\n📌 *Usage:* \`${sessionConfig.PREFIX}news <category>\`\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

        await socket.sendMessage(sender,
            { text: message }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'news': {
    try {
        const q = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '');
        const siteName = q.replace(/^\.news\s+/i, '').trim().toLowerCase();

        if (!siteName) {
            const help = `*📰 DEVELOPER NEXUS  News Command*\n╭━━━━━━━━━━━━━━━━━━●◌\n┇\n┋ *Usage:*\n┋ \`${sessionConfig.PREFIX}news <sitename>\`\n┋ \`${sessionConfig.PREFIX}news <category>\`\n┇\n┋ *Examples:*\n┋ \`${sessionConfig.PREFIX}news bbc\`\n┋ \`${sessionConfig.PREFIX}news cnn\`\n┋ \`${sessionConfig.PREFIX}news derana\`\n┋ \`${sessionConfig.PREFIX}news lankadeepa\`\n┋ \`${sessionConfig.PREFIX}news technology\`\n┋ \`${sessionConfig.PREFIX}news anime\`\n┇\n┋ *See all sites:*\n┋ \`${sessionConfig.PREFIX}newslist\`\n┋ *See categories:*\n┋ \`${sessionConfig.PREFIX}newscats\`\n┇\n╰━━━━━━━━━━━━━━━━━━●◌\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

            return await socket.sendMessage(sender,
                { text: help }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        await socket.sendMessage(sender, { react: { text: '📰', key: msg.key } });
        await socket.sendMessage(sender,
            { text: `*\`⏳ Fetching news from ${siteName}...\`*` }, { quoted: DEVELOPER_NEXUS_minibot });

        let newsItems = [];
        let sourceType = 'site';

        const siteRes = await axios.get(
            `https://www.movanest.xyz/v2/news/fetchfromsite?site=${encodeURIComponent(siteName)}&numArticles=5`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (siteRes?.status && siteRes?.results?.length) {
            newsItems = siteRes.results;
            sourceType = 'site';
        } else {
            const catRes = await axios.get(
                `https://www.movanest.xyz/v2/news/fetchfromcategory?category=${encodeURIComponent(siteName)}&numSites=4`,
                { timeout: 15000 }
            ).then(r => r.data).catch(() => null);

            if (catRes?.status && catRes?.results?.length) {
                newsItems = catRes.results;
                sourceType = 'category';
            }
        }

        if (!newsItems.length)
            return await socket.sendMessage(sender,
                { text: `*\`❌ No news found for "${siteName}". Check .newslist for valid names\`*` },
                { quoted: DEVELOPER_NEXUS_minibot });

        for (const item of newsItems.slice(0, 5)) {
            const source = item.site || siteName;
            const title = item.title || 'N/A';
            const desc = item.description || item.desc || '';
            const date = item.date || item.publishedAt || 'N/A';
            const url = item.url || item.link || '';
            const image = item.image || item.urlToImage || null;

            const caption = `*📰 ${source.toUpperCase()}*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ *${title}*\n│\n│ ${desc.slice(0, 200)}${desc.length > 200 ? '...' : ''}\n│\n│ 🗓️ ${date}\n│ 🔗 ${url}\n╰━━━━━━━━━━━━━━━━━━●◌\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

            try {
                if (image) {
                    await socket.sendMessage(sender, {
                        image: { url: image },
                        caption
                    }, { quoted: DEVELOPER_NEXUS_minibot });
                } else {
                    await socket.sendMessage(sender,
                        { text: caption }, { quoted: DEVELOPER_NEXUS_minibot });
                }
            } catch {
                await socket.sendMessage(sender,
                    { text: caption }, { quoted: DEVELOPER_NEXUS_minibot });
            }

            await new Promise(r => setTimeout(r, 500));
        }

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender,
            { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'mediafire':
case 'mf': {
    try {

        const q =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';

        const url = q.replace(/^\.(mediafire|mf)\s+/i, '').trim();

        if (!url || !url.includes('mediafire.com')) {
            return await socket.sendMessage(sender,
                { text: '*`Need MediaFire URL`*\n📋 Example: .mf https://mediafire.com/file/...' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        await socket.sendMessage(sender, { react: { text: '📁', key: msg.key } });

        const res = await axios.get(
            `https://www.movanest.xyz/v2/mediafire?url=${encodeURIComponent(url)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.status || !res?.results?.urlDownload) {
            return await socket.sendMessage(sender,
                { text: '*`❌ MediaFire download failed`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const data = res.results;
        const dlUrl = data.urlDownload;
        const rawName = data.fileName || 'Unknown';
        const fileName = rawName.length > 50
            ? rawName.slice(0, rawName.length / 3)  
            : rawName;

        const bodyText = `*📁 DEVELOPER NEXUS  MEDIAFIRE DOWNLOADER 📁*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ \`■ File :\` ${fileName}\n│ \`■ Size :\` ${data.fileSize || 'N/A'}\n╰━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ MᴇᴅɪᴀFɪʀᴇ 📁`,
                description: fileName,
                thumbnail: { url: `${sessionConfig.IMAGE}` },
                productId: "DEVELOPER NEXUS -MF-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: url,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "Download Options",
                            sections: [{
                                title: "Options",
                                rows: [
                                    {
                                        header: "DOCUMENT 📁",
                                        title: "Download File",
                                        description: data.fileSize || '',
                                        id: `${sessionConfig.PREFIX}mf2dl ${dlUrl}|||${fileName}`
                                    }
                                ]
                            }]
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Open MediaFire 🔗",
                            url: url
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('MF2 Error:', e.message);
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'mf2dl': {
    try {
        const input = args.join(' ');
        const [dlUrl, ...rest] = input.split('|||');
        const fileName = rest.join('|||') || `DEVELOPER NEXUS _MediaFire_${Date.now()}`;

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            document: { url: dlUrl },
            mimetype: 'application/octet-stream',
            fileName: fileName
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'soundcloud':
case 'sc': {
    try {

        const q =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';

        const query = q.replace(/^\.(soundcloud|sc)\s+/i, '').trim();

        if (!query) {
            return await socket.sendMessage(sender,
                { text: '*`Need Song Title or Keyword`*\n📋 Example: .sc lelena' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        await socket.sendMessage(sender, { react: { text: '🎵', key: msg.key } });

        const res = await axios.get(
            `https://www.movanest.xyz/v2/soundcloud?q=${encodeURIComponent(query)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.status || !res?.results?.length) {
            return await socket.sendMessage(sender,
                { text: '*`❌ No results found`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const tracks = res.results
            .filter(t => t.title && t.permalink_url && t.user)
            .slice(0, 10);

        if (!tracks.length) {
            return await socket.sendMessage(sender,
                { text: '*`❌ No valid tracks found`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const fmtDur = (ms) => {
            if (!ms) return 'N/A';
            const s = Math.floor(ms / 1000);
            return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        };

        const rows = tracks.map((t, i) => ({
            header: `🎵 ${i + 1} | ⏱️ ${fmtDur(t.duration)}`,
            title: t.title.slice(0, 60),
            description: `👤 ${t.user}`,
            id: `${sessionConfig.PREFIX}scdl ${t.permalink_url}`
        }));

        const thumbnail = tracks.find(t => t.artwork_url)?.artwork_url;

        const bodyText = `*🎵 DEVELOPER NEXUS  SOUNDCLOUD SEARCH 🎵*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Query :\` ${query}\n│ \`■ Results :\` ${tracks.length} tracks found\n╰━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ SᴏᴜɴᴅCʟᴏᴜᴅ 🎵`,
                description: `Results for: ${query}`,
                ...(thumbnail && { thumbnail: { url: thumbnail } }),
                productId: "DEVELOPER NEXUS -SC-SEARCH",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: `https://soundcloud.com/search?q=${encodeURIComponent(query)}`,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "🎵 Select Track",
                            sections: [{
                                title: `Search: "${query}" — ${tracks.length} Results`,
                                rows: rows
                            }]
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Search on SoundCloud 🔗",
                            url: `https://soundcloud.com/search?q=${encodeURIComponent(query)}`
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('SoundCloud Error:', e.message);
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'scdl': {
    try {
        const trackUrl = args.join(' ');
        if (!trackUrl) return;

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ SᴏᴜɴᴅCʟᴏᴜᴅ 🎵`,
                description: "Track Link",
                thumbnail: { url: `${sessionConfig.IMAGE}` },
                productId: "DEVELOPER NEXUS -SC-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: trackUrl,
                body: `*🎵 DEVELOPER NEXUS  SOUNDCLOUD 🎵*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Track :\` ${trackUrl.split('/').pop()}\n│ \`■ Open :\` Tap button to listen\n╰━━━━━━━━━━━━━━━━━━●◌`,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Open on SoundCloud 🎵",
                            url: trackUrl
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'saveweb':
case 'web2zip': {
    try {

        const q =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';

        const url = q.replace(/^\.(saveweb|web2zip)\s+/i, '').trim();

        if (!url) {
            return await socket.sendMessage(sender,
                { text: '*`Need Website URL`*\n📋 Example: .saveweb example.com' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        await socket.sendMessage(sender, { react: { text: '🌐', key: msg.key } });
        await socket.sendMessage(sender,
            { text: '*`⏳ Cloning website... Please wait...`*' },
            { quoted: DEVELOPER_NEXUS_minibot }
        );

        const res = await axios.get(
            `https://www.movanest.xyz/v2/saveweb2zip?url=${encodeURIComponent(url)}`,
            { timeout: 60000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.status || !res?.results?.downloadUrl) {
            return await socket.sendMessage(sender,
                { text: '*`❌ Website clone failed`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const data = res.results;
        const dlUrl = data.downloadUrl;
        const fileCount = data.copiedFilesAmount || 0;
        const siteUrl = data.url || url;

        const bodyText = `*🌐 DEVELOPER NEXUS  WEBSITE CLONER 🌐*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Site :\` ${siteUrl}\n│ \`■ Files :\` ${fileCount} files cloned\n│ \`■ Format :\` ZIP Archive\n╰━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ Wᴇʙ Cʟᴏɴᴇʀ 🌐`,
                description: `${fileCount} files cloned`,
                thumbnail: { url: `${sessionConfig.IMAGE}` },
                productId: "DEVELOPER NEXUS -WEB-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: siteUrl,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "Download Options",
                            sections: [{
                                title: "Options",
                                rows: [
                                    {
                                        header: "ZIP 🗜️",
                                        title: "Download as ZIP",
                                        description: `${fileCount} files`,
                                        id: `${sessionConfig.PREFIX}web2zipdl ${dlUrl}`
                                    }
                                ]
                            }]
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Download ZIP 🗜️",
                            url: dlUrl
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('Web2Zip Error:', e.message);
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'web2zipdl': {
    try {
        const dlUrl = args.join(' ');
        if (!dlUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            document: { url: dlUrl },
            mimetype: 'application/zip',
            fileName: `DEVELOPER NEXUS _Website_${Date.now()}.zip`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'threads':
case 'thr': {
    try {

        const q =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';

        const url = q.replace(/^\.(threads|thr)\s+/i, '').trim();

        if (!url || !url.includes('threads.net')) {
            return await socket.sendMessage(sender,
                { text: '*`Need Threads URL`*\n📋 Example: .thr https://www.threads.net/@info_cilegon/post/DSUvfpHieV8' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        await socket.sendMessage(sender, { react: { text: '🧵', key: msg.key } });

        const res = await axios.get(
            `https://www.movanest.xyz/v2/threads?url=${encodeURIComponent(url)}`,
            { timeout: 15000 }
        ).then(r => r.data).catch(() => null);

        if (!res?.status || !res?.results) {
            return await socket.sendMessage(sender,
                { text: '*`❌ Threads download failed`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const data = res.results;
        const videoUrl = data.video;
        const thumbnail = data.thumbnail;

        if (!videoUrl && thumbnail) {
            await socket.sendMessage(sender, {
                image: { url: thumbnail },
                caption: `*🧵 Threads Image*\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
            }, { quoted: DEVELOPER_NEXUS_minibot });
            return await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
        }

        if (!videoUrl) {
            return await socket.sendMessage(sender,
                { text: '*`❌ No downloadable content found`*' },
                { quoted: DEVELOPER_NEXUS_minibot }
            );
        }

        const bodyText = `*🧵 DEVELOPER NEXUS  THREADS DOWNLOADER 🧵*\n╭━━━━━━━━━━━━━━━━━━●◌\n│ \`■ Source :\` Threads\n│ \`■ Select :\` Format below\n╰━━━━━━━━━━━━━━━━━━●◌`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: `Dᴛᴢ Mɪɴɪ Bᴏᴛ Tʜʀᴇᴀᴅs Dʟ 🧵`,
                description: "Select download format",
                ...(thumbnail && { thumbnail: { url: thumbnail } }),
                productId: "DEVELOPER NEXUS -THR-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: url,
                body: bodyText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "Select Format",
                            sections: [{
                                title: "Download Options",
                                rows: [
                                    {
                                        header: "VIDEO 🎥",
                                        title: "Download as Video",
                                        description: "Best quality",
                                        id: `${sessionConfig.PREFIX}thrvideo ${videoUrl}`
                                    },
                                    {
                                        header: "VIDEO NOTE 🎙️",
                                        title: "Download as Video Note",
                                        description: "Watch as note",
                                        id: `${sessionConfig.PREFIX}thrnote ${videoUrl}`
                                    },
                                    {
                                        header: "DOCUMENT 📁",
                                        title: "Download as Document",
                                        description: "Save as document",
                                        id: `${sessionConfig.PREFIX}thrdoc ${videoUrl}`
                                    }
                                ]
                            }]
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Open Thread 🔗",
                            url: url
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('Threads Error:', e.message);
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'thrvideo': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            caption: `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'thrnote': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            ptv: true
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'thrdoc': {
    try {
        const videoUrl = args.join(' ');
        if (!videoUrl) return;
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
        await socket.sendMessage(sender, {
            document: { url: videoUrl },
            mimetype: 'video/mp4',
            fileName: `DEVELOPER NEXUS _Threads_${Date.now()}.mp4`
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (e) {
        await socket.sendMessage(sender, { text: `*❌ Error:* \`${e.message}\`` }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

                case 'song': {
    
    await socket.sendMessage(sender, {
        react: { text: '📍', key: msg.key }
    });

    function extractYouTubeId(url) {
        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }
    function convertYouTubeLink(input) {
        const videoId = extractYouTubeId(input);
        if (videoId) {
            return `https://www.youtube.com/watch?v=${videoId}`;
        }
        return input;
    }
    const q = msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption || '';
    if (!q || q.trim() === '') {
        return await socket.sendMessage(sender, {
            text: '`Need YT_URL or Title`*'
        });
    }
    const fixedQuery = convertYouTubeLink(q.trim());
    const search = await yts(fixedQuery);
    const data = search.videos[0];
    if (!data) {
        return await socket.sendMessage(sender, {
            text: '`No results found`*'
        });
    }
    const url = data.url;
   const fuck =`   ◄◄⠀▐▐ ⠀►►   `
    
    const aliveText = `*🎵 DEVELOPER NEXUS  SONG DOWNLOADER🎵*\n\n╭━━━━━━━━━━━━━━━━━●◌\n*┊• ■ Title :* ${String(data.title || 'N/A')}\n*┊• ■ Duration :* ${String(data.duration?.timestamp || 'N/A')}\n*┊• ■ Views :* ${String(data.views?.toLocaleString?.() || data.views || 'N/A')}\n*┊• ■ Released Date :* ${String(data.ago || 'N/A')}\n*╰━━━━━━━━━━━━━━━━━●◌*`;



    await socket.sendMessage(sender, {
        productMessage: {
            title: fuck,
            thumbnail: { url: data.thumbnail },
            productId: "DEVELOPER NEXUS -SONG-001",
            retailerId: "DEVELOPER NEXUS -TEAM",
            url: url,
            body: aliveText,
            footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
            priceAmount1000: 99999999900,
            currencyCode: "LKR",
            buttons: [
                {
                    name: "single_select",
                    buttonParamsJson: JSON.stringify({
                        title: "Select Download Option",
                        sections: [
                            {
                                title: "Download Options",
                                rows: [
                                    {
                                        header: "AUDIO 🎵",
                                        title: "Download as Audio",
                                        description: "MP3 audio file",
                                        id: `${sessionConfig.PREFIX}audio ${url}`
                                    },
                                    {
                                        header: "VOICE 🎙️",
                                        title: "Download as Voice",
                                        description: "Voice message",
                                        id: `${sessionConfig.PREFIX}voice ${url}`
                                    },
                                    {
                                        header: "DOCUMENT 📁",
                                        title: "Download as Document",
                                        description: "Save as document",
                                        id: `${sessionConfig.PREFIX}document ${url}`
                                    }
                                ]
                            }
                        ]
                    })
                },
                {
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({
                        display_text: "Open Song 🔗",
                        url: url
                    })
                }
            ]
        }
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;
}
                                            
case 'voice': {

await socket.sendMessage(sender, {
        react: { text: '📍', key: msg.key }
    });
    const m = msg;
    const quotedMsg = m;
    const q = m.message?.conversation ||
              m.message?.extendedTextMessage?.text ||
              m.message?.imageMessage?.caption ||
              m.message?.videoMessage?.caption || '';

    const videoUrl = args[0] || q;

    if (!videoUrl) {
        await socket.sendMessage(sender, { text: '*Please provide a YouTube URL*', quoted: DEVELOPER_NEXUS_minibot });
        break;
    }

    try {
        const apiUrl = `https://DEVELOPER NEXUS -api-v1.vercel.app/api/download/song?url=${encodeURIComponent(videoUrl)}`;
        const apiRes = await axios.get(apiUrl, { timeout: 20000 }).then(r => r.data);

        if (!apiRes?.status || !apiRes?.data?.url) {
            await socket.sendMessage(sender, {
                text: '*Could not get download link (API issue or video unavailable)*',
                quoted: DEVELOPER_NEXUS_minibot
            });
            break;
        }

        const downloadUrl = apiRes.data.url;
        const title = apiRes.data.title?.replace(/[^\w\s-]/gi, '') || 'voice_note';

        const tempMp4 = path.join("/tmp", `voice_${Date.now()}.mp4`);
        const tempOpus = path.join("/tmp", `voice_${Date.now()}.opus`);

        const mp4Response = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(tempMp4, Buffer.from(mp4Response.data));

       
        await new Promise((resolve, reject) => {
            ffmpeg(tempMp4)
                .noVideo()
                .audioCodec('libopus')
                .audioBitrate('96k')          
                .format('opus')
                .save(tempOpus)
                .on('end', resolve)
                .on('error', (err) => reject(err));
        });

        const opusBuffer = fs.readFileSync(tempOpus);

        await socket.sendMessage(sender, {
            audio: opusBuffer,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true,
            fileName: `${title}.opus`,
            quoted: DEVELOPER_NEXUS_minibot
        });

        try { fs.unlinkSync(tempMp4); } catch {}
        try { fs.unlinkSync(tempOpus); } catch {}

    } catch (err) {
        console.error('Voice error:', err?.message || err);
        await socket.sendMessage(sender, {
            text: '*Error while processing voice note*',
            quoted: DEVELOPER_NEXUS_minibot
        });
    }
    break;
}

case 'document': {
await socket.sendMessage(sender, {
        react: { text: '📍', key: msg.key }
    });
    const m = msg;
    const quotedMsg = m;
    const q = m.message?.conversation ||
              m.message?.extendedTextMessage?.text ||
              m.message?.imageMessage?.caption ||
              m.message?.videoMessage?.caption || '';

    const videoUrl = args[0] || q;

    if (!videoUrl) {
        await socket.sendMessage(sender, { text: '*Please provide a YouTube URL*', quoted: DEVELOPER_NEXUS_minibot });
        break;
    }


    try {
        const apiUrl = `https://DEVELOPER NEXUS -api-v1.vercel.app/api/download/song?url=${encodeURIComponent(videoUrl)}`;
        const apiRes = await axios.get(apiUrl, { timeout: 20000 }).then(r => r.data);

        if (!apiRes?.status || !apiRes?.data?.url) {
            await socket.sendMessage(sender, {
                text: '*Could not get download link*',
                quoted: DEVELOPER_NEXUS_minibot
            });
            break;
        }

        const downloadUrl = apiRes.data.url;
        const title = apiRes.data.title?.replace(/[^\w\s-]/gi, '') || 'audio';

        const tempMp4 = path.join("/tmp", `doc_${Date.now()}.mp4`);
        const tempMp3 = path.join("/tmp", `doc_${Date.now()}.mp3`);

        const mp4Response = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(tempMp4, Buffer.from(mp4Response.data));

        await new Promise((resolve, reject) => {
            ffmpeg(tempMp4)
                .noVideo()
                .audioCodec('libmp3lame')
                .audioBitrate('192k')         
                .format('mp3')
                .save(tempMp3)
                .on('end', resolve)
                .on('error', (err) => reject(err));
        });

        await socket.sendMessage(sender, {
            document: { url: tempMp3 },
            mimetype: 'audio/mpeg',
            fileName: `${title}.mp3`,
            quoted: DEVELOPER_NEXUS_minibot
        });

        try { fs.unlinkSync(tempMp4); } catch {}
        try { fs.unlinkSync(tempMp3); } catch {}

    } catch (err) {
        console.error('Document audio error:', err?.message || err);
        await socket.sendMessage(sender, {
            text: '*Error while processing audio document*',
            quoted: DEVELOPER_NEXUS_minibot
        });
    }
    break;
}

case 'audio': {
await socket.sendMessage(sender, {
        react: { text: '📍', key: msg.key }
    });
    const m = msg;
    const quotedMsg = m;
    const q = m.message?.conversation ||
              m.message?.extendedTextMessage?.text ||
              m.message?.imageMessage?.caption ||
              m.message?.videoMessage?.caption || '';

    const videoUrl = args[0] || q;

    if (!videoUrl) {
        await socket.sendMessage(sender, { text: '*Please provide a YouTube URL*', quoted: DEVELOPER_NEXUS_minibot });
        break;
    }

    try {
        const apiUrl = `https://DEVELOPER NEXUS -api-v1.vercel.app/api/download/song?url=${encodeURIComponent(videoUrl)}`;
        const apiRes = await axios.get(apiUrl, { timeout: 20000 }).then(r => r.data);

        if (!apiRes?.status || !apiRes?.data?.url) {
            await socket.sendMessage(sender, {
                text: '*Could not get download link*',
                quoted: DEVELOPER_NEXUS_minibot
            });
            break;
        }

        const downloadUrl = apiRes.data.url;
        const title = apiRes.data.title?.replace(/[^\w\s-]/gi, '') || 'audio';

        const tempMp4 = path.join("/tmp", `doc_${Date.now()}.mp4`);
        const tempMp3 = path.join("/tmp", `doc_${Date.now()}.mp3`);

        const mp4Response = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(tempMp4, Buffer.from(mp4Response.data));

        await new Promise((resolve, reject) => {
            ffmpeg(tempMp4)
                .noVideo()
                .audioCodec('libmp3lame')
                .audioBitrate('192k')         
                .format('mp3')
                .save(tempMp3)
                .on('end', resolve)
                .on('error', (err) => reject(err));
        });

        await socket.sendMessage(sender, {
            audio: { url: tempMp3 },
            mimetype: 'audio/mpeg',
            fileName: `${title}.mp3`,
            quoted: DEVELOPER_NEXUS_minibot
        });

        try { fs.unlinkSync(tempMp4); } catch {}
        try { fs.unlinkSync(tempMp3); } catch {}

    } catch (err) {
        console.error('Document audio error:', err?.message || err);
        await socket.sendMessage(sender, {
            text: '*Error while processing audio document*',
            quoted: DEVELOPER_NEXUS_minibot
        });
    }
    break;
}


case 'video': {
    await socket.sendMessage(sender, {
        react: { text: '📍', key: msg.key }
    });
    function extractYouTubeId(url) {
        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }
    function convertYouTubeLink(input) {
        const videoId = extractYouTubeId(input);
        if (videoId) {
            return `https://www.youtube.com/watch?v=${videoId}`;
        }
        return input;
    }
    const q = msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption || '';
    if (!q || q.trim() === '') {
        return await socket.sendMessage(sender, {
            text: '`Need YT_URL or Title`*'
        });
    }
    const fixedQuery = convertYouTubeLink(q.trim());
    const search = await yts(fixedQuery);
    const data = search.videos[0];
    if (!data) {
        return await socket.sendMessage(sender, {
            text: '`No results found`*'
        });
    }
    const url = data.url;
const fuck =` Dᴛᴢ Mɪɴɪ Bᴏᴛ Vɪᴅᴇᴏ Dʟ ☃️`
    
    const aliveText = `*🎵 DEVELOPER NEXUS  VIDEO DOWNLOADER🎵*\n\n╭━━━━━━━━━━━━━━━━━●◌\n*┊• ■ Title :* ${String(data.title || 'N/A')}\n*┊• ■ Duration :* ${String(data.duration?.timestamp || 'N/A')}\n*┊• ■ Views :* ${String(data.views?.toLocaleString?.() || data.views || 'N/A')}\n*┊• ■ Released Date :* ${String(data.ago || 'N/A')}\n*╰━━━━━━━━━━━━━━━━━●◌*`;


    await socket.sendMessage(sender, {
        productMessage: {
            title: fuck,
            description: "Donnjjooollllw",
            thumbnail: { url: data.thumbnail },
            productId: "DEVELOPER NEXUS -VIDEO-001",
            retailerId: "DEVELOPER NEXUS -TEAM",
            url: url,
            body: aliveText,
            footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
            priceAmount1000: 99999999900,
            currencyCode: "LKR",
            buttons: [
                {
                    name: "single_select",
                    buttonParamsJson: JSON.stringify({
                        title: "Select Download Option",
                        sections: [
                            {
                                title: "Download Options",
                                rows: [
                                    {
                                        header: "VIDEO 📽️",
                                        title: "Download as Video",
                                        description: "High quality video",
                                        id: `${sessionConfig.PREFIX}normal ${url}`
                                    },
                                    {
                                        header: "VIDEO NOTE 🎥",
                                        title: "Download as Video Note",
                                        description: "Watch as note",
                                        id: `${sessionConfig.PREFIX}vnote ${url}`
                                    },
                                    {
                                        header: "DOCUMENT 📁",
                                        title: "Download as Document",
                                        description: "Save as document",
                                        id: `${sessionConfig.PREFIX}doc ${url}`
                                    }
                                ]
                            }
                        ]
                    })
                },
                {
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({
                        display_text: "Open Video 🔗",
                        url: url
                    })
                }
            ]
        }
    }, { quoted: DEVELOPER_NEXUS_minibot });
    break;
}

case 'doc': {
    const m = msg;
    const quotedMsg = m;
    const q = m.message?.conversation ||
              m.message?.extendedTextMessage?.text ||
              m.message?.imageMessage?.caption ||
              m.message?.videoMessage?.caption || '';

    const videoUrl = args[0] || q;

    if (!videoUrl) {
        await socket.sendMessage(sender, {
            text: '*Please provide a YouTube URL*',
            quoted: quotedMsg
        });
        break;
    }


    try {
        const apiUrl = `https://DEVELOPER NEXUS -api-v1.vercel.app/api/download/video?url=${encodeURIComponent(videoUrl)}`;
        const apiRes = await axios.get(apiUrl, { timeout: 20000 }).then(r => r.data);

        if (!apiRes?.status || !apiRes?.data?.url) {
            await socket.sendMessage(sender, {
                text: '*Could not get download link (video not available or API issue)*',
                quoted: quotedMsg
            });
            break;
        }

        const downloadUrl = apiRes.data.url;
        const title = apiRes.data.title || 'video';

        await socket.sendMessage(sender, {
            document: { url: downloadUrl },
            mimetype: 'video/mp4',
            fileName: `${title}.mp4`,
            quoted: quotedMsg
        });

    } catch (err) {
        console.error(err?.message || err);
        await socket.sendMessage(sender, {
            text: '*Error while processing document request*',
            quoted: quotedMsg
        });
    }
    break;
}

case 'vnote': {
    const m = msg;
    const quotedMsg = m;
    const q = m.message?.conversation ||
              m.message?.extendedTextMessage?.text ||
              m.message?.imageMessage?.caption ||
              m.message?.videoMessage?.caption || '';

    const videoUrl = args[0] || q;

    if (!videoUrl) {
        await socket.sendMessage(sender, {
            text: '*Please provide a YouTube URL*',
            quoted: quotedMsg
        });
        break;
    }


    try {
        const apiUrl = `https://DEVELOPER NEXUS -api-v1.vercel.app/api/download/video?url=${encodeURIComponent(videoUrl)}`;
        const apiRes = await axios.get(apiUrl, { timeout: 20000 }).then(r => r.data);

        if (!apiRes?.status || !apiRes?.data?.url) {
            await socket.sendMessage(sender, {
                text: '*Could not get download link (video not available or API issue)*',
                quoted: quotedMsg
            });
            break;
        }

        const downloadUrl = apiRes.data.url;
        const title = apiRes.data.title || 'video';

        await socket.sendMessage(sender, {
            video: { url: downloadUrl },
            mimetype: 'video/mp4',
            ptt: true,
            fileName: `${title}.mp4`,
            quoted: quotedMsg
        });

    } catch (err) {
        console.error(err?.message || err);
        await socket.sendMessage(sender, {
            text: '*Error while processing video note*',
            quoted: quotedMsg
        });
    }
    break;
}

case 'normal': {
    const m = msg;
    const quotedMsg = m;
    const q = m.message?.conversation ||
              m.message?.extendedTextMessage?.text ||
              m.message?.imageMessage?.caption ||
              m.message?.videoMessage?.caption || '';

    const videoUrl = args[0] || q;

    if (!videoUrl) {
        await socket.sendMessage(sender, {
            text: '*Please provide a YouTube URL*',
            quoted: quotedMsg
        });
        break;
    }


    try {
        const apiUrl = `https://DEVELOPER NEXUS -api-v1.vercel.app/api/download/video?url=${encodeURIComponent(videoUrl)}`;
        const apiRes = await axios.get(apiUrl, { timeout: 20000 }).then(r => r.data);

        if (!apiRes?.status || !apiRes?.data?.url) {
            await socket.sendMessage(sender, {
                text: '*Could not get download link (video not available or API issue)*',
                quoted: quotedMsg
            });
            break;
        }

        const downloadUrl = apiRes.data.url;
        const title = apiRes.data.title || 'video';

        await socket.sendMessage(sender, {
            video: { url: downloadUrl },
            mimetype: 'video/mp4',
            fileName: `${title}.mp4`,
            quoted: quotedMsg
        });

    } catch (err) {
        console.error(err?.message || err);
        await socket.sendMessage(sender, {
            text: '*Error while processing video request*',
            quoted: quotedMsg
        });
    }
    break;
}

case 'csend':
case 'csong':
case 'send4': {

    const query = msg.message?.conversation ||
                  msg.message?.extendedTextMessage?.text || '';

    const q = query.replace(/^\.(?:csend|csong|send4)\s+/i, '').trim();

    if (!q) {
        await socket.sendMessage(sender, {
            text: "*❗ Need a song title/URL and WhatsApp JID!*\n📋 Example: .csend Believer 120363349375266377@newsletter"
        });
        break;
    }

    const parts = q.split(' ');
    if (parts.length < 2) {
        await socket.sendMessage(sender, {
            text: "*❗ Please provide both song title/URL and JID!*\n📋 Example: .csend Believer 120363349375266377@newsletter"
        });
        break;
    }

    const jid = parts.pop();
    const songQuery = parts.join(' ');

    if (!jid.includes('@s.whatsapp.net') && !jid.includes('@g.us') && !jid.includes('@newsletter')) {
        await socket.sendMessage(sender, {
            text: "*❌ Invalid JID format!*\n🔍 Use a valid WhatsApp JID"
        });
        break;
    }

    await socket.sendMessage(sender, { react: { text: '🎵', key: msg.key } });

    let searchQuery = songQuery;
    let videoData = null;

    if (!searchQuery.includes('youtube.com') && !searchQuery.includes('youtu.be')) {
        const search = await yts(songQuery);
        videoData = search.videos[0];

        if (!videoData) {
            await socket.sendMessage(sender, { text: "*❌ No song results found!*" });
            break;
        }

        searchQuery = videoData.url;
    }

    await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

    const apiRes = await axios.get(
        `https://DEVELOPER NEXUS -download-api.vercel.app/api/download/ytmp3?url=${encodeURIComponent(searchQuery)}`,
        { timeout: 30000 }
    ).then(r => r.data).catch(() => null);

    const downloadUrl = apiRes?.data?.url;
    const title = apiRes?.data?.title || videoData?.title || 'Unknown';

    if (!downloadUrl) {
        await socket.sendMessage(sender, { text: '*❌ API returned no download URL*' });
        break;
    }

    const unique = Date.now();
    const tempMp3 = path.join(__dirname, `temp_${unique}.mp3`);
    const tempOpus = path.join(__dirname, `temp_${unique}.opus`);

    const mp3Res = await axios.get(downloadUrl, { responseType: 'arraybuffer', timeout: 60000 });
    fs.writeFileSync(tempMp3, mp3Res.data);

    try {
        await new Promise((resolve, reject) => {
            ffmpeg(tempMp3)
                .audioCodec("libopus")
                .format("opus")
                .on("end", () => {
                    if (!fs.existsSync(tempOpus)) return reject(new Error("Opus conversion failed!"));
                    resolve();
                })
                .on("error", (err) => reject(err))
                .save(tempOpus);
        });
    } catch (err) {
        await socket.sendMessage(sender, { text: "❌ Conversion failed!" });
        if (fs.existsSync(tempMp3)) fs.unlinkSync(tempMp3);
        break;
    }

    if (videoData) {
        await socket.sendMessage(jid, {
            image: { url: videoData.thumbnail },
            caption: `_*🎧 Ｓᴏɴɢ Ｔɪᴛʟᴇ :* ${videoData.title}_\n\n■  *📆 Ｒᴇʟᴇᴀꜱᴇ Ｄᴀᴛᴇ :* ${videoData.ago}\n■  *⌛ Ｄᴜʀᴀᴛɪᴏɴ :* ${videoData.timestamp}\n■  *👀 Ｖɪᴇᴡꜱ :* ${videoData.views}\n■  *🔗 Ｓᴏɴɢ Ｌɪɴᴋ :* ${videoData.url}\n\n*_Uꜱᴇ Hᴇᴀᴅᴘʜᴏɴᴇꜱ Fᴏʀ Tʜᴇ Bᴇꜱᴛ Exᴘᴇʀɪᴇɴᴄᴇ... 🙇🏻🤍🎧_*\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        });
    }

    if (!fs.existsSync(tempOpus)) {
        await socket.sendMessage(sender, { text: "❌ Opus file not found" });
        break;
    }

    const opusBuffer = fs.readFileSync(tempOpus);

    await socket.sendMessage(jid, {
        audio: opusBuffer,
        mimetype: "audio/ogg; codecs=opus",
        ptt: true,
    });

    try { fs.unlinkSync(tempMp3); } catch {}
    try { fs.unlinkSync(tempOpus); } catch {}

    await socket.sendMessage(sender, {
        text: `*✅ Successfully sent "${title}" as a voice note to ${jid}*\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ™❗*`
    });

    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    break;
}

case 'DEVELOPER NEXUS song': {

    const query = msg.message?.conversation ||
                  msg.message?.extendedTextMessage?.text || '';

    const q = query.replace(/^\.DEVELOPER NEXUS song\s+/i, '').trim();

    if (!q) {
        await socket.sendMessage(sender, {
            text: "*❗ Need a song title/URL and WhatsApp JID!*\n📋 Example: .DEVELOPER NEXUS song Believer 120363349375266377@newsletter"
        });
        break;
    }

    const parts = q.split(' ');
    if (parts.length < 2) {
        await socket.sendMessage(sender, {
            text: "*❗ Please provide both song title/URL and JID!*\n📋 Example: .DEVELOPER NEXUS song Believer 120363349375266377@newsletter"
        });
        break;
    }

    const jid = parts.pop();
    const songQuery = parts.join(' ');

    if (!jid.includes('@s.whatsapp.net') && !jid.includes('@g.us') && !jid.includes('@newsletter')) {
        await socket.sendMessage(sender, {
            text: "*❌ Invalid JID format!*"
        });
        break;
    }

    await socket.sendMessage(sender, { react: { text: '🎵', key: msg.key } });

    let searchQuery = songQuery;
    let videoData = null;

    if (!searchQuery.includes('youtube.com') && !searchQuery.includes('youtu.be')) {
        const search = await yts(songQuery);
        videoData = search.videos[0];

        if (!videoData) {
            await socket.sendMessage(sender, { text: "*❌ No song results found!*" });
            break;
        }

        searchQuery = videoData.url;
    }

    await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

    const apiRes = await axios.get(
        `https://DEVELOPER NEXUS -download-api.vercel.app/api/download/ytmp3?url=${encodeURIComponent(searchQuery)}`,
        { timeout: 30000 }
    ).then(r => r.data).catch(() => null);

    const downloadUrl = apiRes?.data?.url;
    const title = apiRes?.data?.title || videoData?.title || 'Unknown';

    if (!downloadUrl) {
        await socket.sendMessage(sender, { text: '*❌ API returned no download URL*' });
        break;
    }

    const unique = Date.now();
    const tempMp3 = path.join(__dirname, `temp_${unique}.mp3`);
    const tempOpus = path.join(__dirname, `temp_${unique}.opus`);

    const mp3Res = await axios.get(downloadUrl, { responseType: 'arraybuffer', timeout: 60000 });
    fs.writeFileSync(tempMp3, mp3Res.data);

    try {
        await new Promise((resolve, reject) => {
            ffmpeg(tempMp3)
                .audioCodec("libopus")
                .format("opus")
                .on("end", () => {
                    if (!fs.existsSync(tempOpus)) return reject(new Error("Opus conversion failed!"));
                    resolve();
                })
                .on("error", (err) => reject(err))
                .save(tempOpus);
        });
    } catch (err) {
        await socket.sendMessage(sender, { text: "❌ Conversion failed!" });
        if (fs.existsSync(tempMp3)) fs.unlinkSync(tempMp3);
        break;
    }

    if (videoData) {
        await socket.sendMessage(jid, {
            image: { url: videoData.thumbnail },
            caption: `_*🎧 Ｓᴏɴɢ Ｔɪᴛʟᴇ :* ${videoData.title}_\n\n■  *📆 Ｒᴇʟᴇᴀꜱᴇ Ｄᴀᴛᴇ :* ${videoData.ago}\n■  *⌛ Ｄᴜʀᴀᴛɪᴏɴ :* ${videoData.timestamp}\n■  *👀 Ｖɪᴇᴡꜱ :* ${videoData.views}\n■  *🔗 Ｓᴏɴɢ Ｌɪɴᴋ :* ${videoData.url}\n\n*_Uꜱᴇ Hᴇᴀᴅᴘʜᴏɴᴇꜱ Fᴏʀ Tʜᴇ Bᴇꜱᴛ Exᴘᴇʀɪᴇɴᴄᴇ... 🙇🏻🤍🎧_*\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        });
    }

    if (!fs.existsSync(tempOpus)) {
        await socket.sendMessage(sender, { text: "❌ Opus file not found" });
        break;
    }

    const opusBuffer = fs.readFileSync(tempOpus);

    await socket.sendMessage(jid, {
        audio: opusBuffer,
        mimetype: "audio/ogg; codecs=opus",
        ptt: true,
    });

    try { fs.unlinkSync(tempMp3); } catch {}
    try { fs.unlinkSync(tempOpus); } catch {}

    await socket.sendMessage(sender, {
        text: `*✅ Successfully sent "${title}" as a voice note to ${jid}*\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ™❗*`
    });

    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    break;
}
                   
case 'tiktok':
case 'tt': {
    try {


        const q =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';

        const url = q.replace(/^\.(tiktok|tt)\s+/i, '').trim();
        
        if (!url || url === '') {
            return await socket.sendMessage(sender, {
                text: '`Need TikTok URL`*'
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        const api = `https://movanest.xyz/v2/tiktok?url=${encodeURIComponent(url)}`;
        const res = await axios.get(api).then(r => r.data).catch(() => null);
        
        if (!res || !res.status || !res.results) {
            return await socket.sendMessage(sender, {
                text: '`No results found`*'
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        const data = res.results;
        const fuck = `   ◄◄⠀▐▐ ⠀►►   `;

        const aliveText = `*🎵 DEVELOPER NEXUS  TIKTOK DOWNLOADER 🎵*\n╭━━━━━━━━━━━━━━━━━●◌\n*┊• ■ Title :* ${String(data.title || 'N/A')}\n*┊• ■ Author :* ${String(data.author || 'Unknown')}\n*┊• ■ Quality :* No Watermark\n*╰━━━━━━━━━━━━━━━━━●◌*`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: fuck,
                thumbnail: { url: data.cover || data.origin_cover },
                productId: "DEVELOPER NEXUS -TT-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: url,
                body: aliveText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "Select Download Option",
                            sections: [
                                {
                                    title: "Download Options",
                                    rows: [
                                        {
                                            header: "VIDEO 🎥",
                                            title: "Download as Video",
                                            description: "No watermark MP4",
                                            id: `${sessionConfig.PREFIX}ttvideo ${url}`
                                        },
                                        {
                                            header: "VIDEO NOTE 🎙️",
                                            title: "Download as Video Note",
                                            description: "Video note format",
                                            id: `${sessionConfig.PREFIX}ttnote ${url}`
                                        },
                                        {
                                            header: "DOCUMENT 📁",
                                            title: "Download as Document",
                                            description: "Save as document",
                                            id: `${sessionConfig.PREFIX}ttdoc ${url}`
                                        }
                                    ]
                                }
                            ]
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Open TikTok 🔗",
                            url: url
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

    } catch (e) {
        console.error(e);
        await socket.sendMessage(sender, { 
            text: '*`Error occurred`*' 
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'ttdoc': {
    try {

        const url = args.join(' ');
        
        if (!url) {
            return await socket.sendMessage(sender, {
                text: '*`Need TikTok URL`*'
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        const api = `https://movanest.xyz/v2/tiktok?url=${encodeURIComponent(url)}`;
        const res = await axios.get(api).then(r => r.data).catch(() => null);
        
        if (!res || !res.status || !res.results || !res.results.no_watermark) {
            throw 'Download failed';
        }

        await socket.sendMessage(sender, {
            document: { url: res.results.no_watermark },
            mimetype: 'video/mp4',
            fileName: `${res.results.title || 'tiktok'}.mp4`,
            caption: `*${res.results.title || 'TikTok Video'}*\n*Author:* ${res.results.author || 'Unknown'}\n\n> © ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });

    } catch (e) {
        console.error(e);
        await socket.sendMessage(sender, { 
            text: '*`Document download error`*' 
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'ttvideo': {
    try {
        const axios = require('axios');
        const url = args.join(' ');
        
        if (!url) {
            return await socket.sendMessage(sender, {
                text: '*`Need TikTok URL`*'
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        const api = `https://movanest.xyz/v2/tiktok?url=${encodeURIComponent(url)}`;
        const res = await axios.get(api).then(r => r.data).catch(() => null);
        
        if (!res || !res.status || !res.results || !res.results.no_watermark) {
            throw 'Download failed';
        }

        await socket.sendMessage(sender, {
            video: { url: res.results.no_watermark },
            mimetype: 'video/mp4',
            caption: `${res.results.title || 'TikTok Video'}\n*Author:* ${res.results.author || 'Unknown'}\n\n> © ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });

    } catch (e) {
        console.error(e);
        await socket.sendMessage(sender, { 
            text: '*`Video download error`*' 
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'ttnote': {
    try {

        const url = args.join(' ');
        
        if (!url) {
            return await socket.sendMessage(sender, {
                text: '*`Need TikTok URL`*'
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        const api = `https://movanest.xyz/v2/tiktok?url=${encodeURIComponent(url)}`;
        const res = await axios.get(api).then(r => r.data).catch(() => null);
        
        if (!res || !res.status || !res.results || !res.results.no_watermark) {
            throw 'Download failed';
        }

        await socket.sendMessage(sender, {
            video: { url: res.results.no_watermark },
            mimetype: 'video/mp4',
            ptv: true
        }, { quoted: DEVELOPER_NEXUS_minibot });

    } catch (e) {
        console.error(e);
        await socket.sendMessage(sender, { 
            text: '*`Video note download error`*' 
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'fbdl':
case 'facebook':
case 'fb': {

    const q = msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.buttonsResponseMessage?.selectedButtonId || '';

    const link = q.replace(/^[.\/!](facebook|fb|fbdl)\s*/i, '').trim();

    if (!link) return await socket.sendMessage(sender, {
        text: '📃 *Usage :* .facebook `<link>`'
    }, {
        quoted: DEVELOPER_NEXUS_minibot
    });
    
    if (!link.includes('facebook.com') && !link.includes('fb.watch')) {
        return await socket.sendMessage(sender, {
            text: '*Invalid Facebook link.*'
        }, {
            quoted: DEVELOPER_NEXUS_minibot
        });
    }

    try {
        const apiUrl = `https://apis.prexzyvilla.site/download/facebook?url=${encodeURIComponent(link)}`;
        const { data } = await axios.get(apiUrl);
        
        if (!data.data) {
            return await socket.sendMessage(sender, {
                text: '*`No results found`*'
            }, {
                quoted: DEVELOPER_NEXUS_minibot
            });
        }

        const fb = data.data;
        const fuck = `   ◄◄⠀▐▐ ⠀►►   `;

        const aliveText = `*🎥 DEVELOPER NEXUS  FB DOWNLOADER 🎥*\n╭━━━━━━━━━━━━━━━━━●◌\n*┊• ■ Title :* ${String(fb.title || 'N/A')}\n*┊• ■ Link :* ${link}\n*┊• ■ Quality :* HD\n*╰━━━━━━━━━━━━━━━━━●◌*`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: fuck,
                thumbnail: { url: fb.thumbnail },
                productId: "DEVELOPER NEXUS -FB-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: link,
                body: aliveText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "Select Download Option",
                            sections: [
                                {
                                    title: "Download Options",
                                    rows: [
                                        {
                                            header: "VIDEO 📽️",
                                            title: "Download as Video",
                                            description: "HD Quality MP4",
                                            id: `${sessionConfig.PREFIX}fbnormal ${link}`
                                        },
                                        {
                                            header: "VIDEO NOTE 🎥",
                                            title: "Download as Video Note",
                                            description: "Video note format",
                                            id: `${sessionConfig.PREFIX}fbvnote ${link}`
                                        },
                                        {
                                            header: "DOCUMENT 📁",
                                            title: "Download as Document",
                                            description: "Save as document",
                                            id: `${sessionConfig.PREFIX}fbdocument ${link}`
                                        }
                                    ]
                                }
                            ]
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Open Facebook 🔗",
                            url: link
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

    } catch (e) {
        console.error('Facebook Download Error:', e);
        await socket.sendMessage(sender, {
            text: '*Error while processing video request*'
        }, {
            quoted: DEVELOPER_NEXUS_minibot
        });
    }
    break;
}                

                case 'fbvnote': {

                    const videoUrl = args[0] || q;

                    try {
                        const {
                            data: apiData
                        } = await axios.get(
                            `https://apis.prexzyvilla.site/download/facebookv2?url=${encodeURIComponent(videoUrl)}`, {
                                timeout: 15000
                            }
                        );

                        if (!apiData?.data?.download_links?.length) {
                            await socket.sendMessage(sender, {
                                text: '*Video not found*'
                            }, {
                                quoted: DEVELOPER_NEXUS_minibot
                            });
                            break;
                        }

                        const firstLink = apiData.data.download_links[0]; // Direct [0]

                        await socket.sendMessage(sender, {
                            video: {
                                url: firstLink.url
                            },
                            mimetype: 'video/mp4',
                            ptv: true,
                            fileName: `${apiData.data.title || 'Facebook Video'}.mp4`
                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });

                    } catch (err) {
                        console.error('FBVNote Error:', err.message);
                        await socket.sendMessage(sender, {
                            text: '*Error processing video note*'
                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });
                    }
                    break;
                }


                case 'fbdocument': {

                    const videoUrl = args[0] || q;

                    try {
                        const {
                            data: apiData
                        } = await axios.get(
                            `https://apis.prexzyvilla.site/download/facebookv2?url=${encodeURIComponent(videoUrl)}`, {
                                timeout: 15000
                            }
                        );

                        if (!apiData?.data?.download_links?.length) {
                            await socket.sendMessage(sender, {
                                text: '*Video not found*'
                            }, {
                                quoted: DEVELOPER_NEXUS_minibot
                            });
                            break;
                        }

                        const firstLink = apiData.data.download_links[0];

                        await socket.sendMessage(sender, {
                            document: {
                                url: firstLink.url
                            },
                            mimetype: 'video/mp4',
                            fileName: `Facebook Video - ${apiData.data.title || 'Video'}.mp4`
                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });

                    } catch (err) {
                        console.error('FBDocument Error:', err.message);
                        await socket.sendMessage(sender, {
                            text: '*Error downloading as document*'
                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });
                    }
                    break;
                }

                case 'fbnormal': {

                    const videoUrl = args[0] || q;

                    try {
                        const {
                            data: apiData
                        } = await axios.get(
                            `https://apis.prexzyvilla.site/download/facebookv2?url=${encodeURIComponent(videoUrl)}`, {
                                timeout: 15000
                            }
                        );

                        if (!apiData?.data?.download_links?.length) {
                            await socket.sendMessage(sender, {
                                text: '*Video not found*'
                            }, {
                                quoted: DEVELOPER_NEXUS_minibot
                            });
                            break;
                        }

                        const firstLink = apiData.data.download_links[0];

                        const titleCaption = apiData.data.title ? `${apiData.data.title}\n\n` : '';

                        await socket.sendMessage(sender, {
                            video: {
                                url: firstLink.url
                            },
                            mimetype: 'video/mp4',
                            fileName: `Facebook Video - ${apiData.data.title || 'Video'}.mp4`
                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });

                    } catch (err) {
                        console.error('FBNormal Error:', err.message);
                        await socket.sendMessage(sender, {
                            text: '*Error downloading video*'
                        }, {
                            quoted: DEVELOPER_NEXUS_minibot
                        });
                    }
                    break;
                }

case 'ginfo':
case 'groupinfo':
case 'gcinfo': {
    if (!isOwner) {
        return await socket.sendMessage(sender, {
            text: '👥 This command use only owner.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    let metadata;
    try {
        metadata = await socket.groupMetadata(sender);
    } catch (e) {
        return await socket.sendMessage(sender, {
            text: '❌ Unable to fetch group metadata.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    const admins = metadata.participants.filter((p) => p.admin !== null);
    const owner = metadata.owner || metadata.participants.find((p) => p.admin === "superadmin")?.id;
    const description = metadata.desc;

    let pp;
    try {
        pp = await socket.profilePictureUrl(sender, "image");
    } catch (e) {
        pp = "https://telegra.ph/file/9e58d8c3d8ed6a22e2c42.jpg";
    }

    const groupInfo = `*📱 DEVELOPER NEXUS  GROUP INFO 📱*

╭━━━━━━━━━━━━━━━━━●◌
│ 📛 *Group Name:* ${metadata.subject}
│ 🆔 *Group ID:* ${metadata.id}
│ 👤 *Owner:* ${owner ? "@" + owner.split("@")[0] : "Unknown"}
│ 👥 *Members:* ${metadata.participants.length}
│ 🛡️ *Admins:* ${admins.length}
│ 📅 *Created:* ${new Date(metadata.creation * 1000).toLocaleDateString()}
╰━━━━━━━━━━━━━━━━━●◌

📝 *Description:*
${description}

> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`.trim();

    await socket.sendMessage(sender, {
        image: { url: pp },
        caption: groupInfo,
        mentions: owner ? [owner] : []
    }, { quoted: DEVELOPER_NEXUS_minibot });

    break;
}

case 'rw2':
case 'randomwall2':
case 'wallpaper2': {


    const q = msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption || '';

    const query = q.replace(/^\.(?:rw|randomwall|wallpaper)\s+/i, '').trim() || 'random';

    const apiUrl = `https://pikabotzapi.vercel.app/random/randomwall/?apikey=anya-md&query=${encodeURIComponent(query)}`;

    const { data } = await axios.get(apiUrl);

    if (data.status && data.imgUrl) {
        const caption = `*🌌 DEVELOPER NEXUS  RANDOM WALLPAPER 🌌*\n\n*Search:* ${query}\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;
        
        await socket.sendMessage(sender, {
            image: { url: data.imgUrl },
            caption: caption
        }, { quoted: DEVELOPER_NEXUS_minibot });
    } else {
        await socket.sendMessage(sender, {
            text: `❌ No wallpaper found for *"${query}"*.`
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    break;
}

case 'gclink':
case 'grouplink': {
    if (!isGroup) {
        return await socket.sendMessage(sender, {
            text: '❌ This is a group only command.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    if (!isOwner) {
        return await socket.sendMessage(sender, {
            text: '❌ Owner Only Command..❗'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }


    const code = await socket.groupInviteCode(sender);
    
    await socket.sendMessage(sender, {
        text: `*🔗 GROUP INVITE LINK*\n\nhttps://chat.whatsapp.com/${code}\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
    }, { quoted: DEVELOPER_NEXUS_minibot });

    break;
}

case 'apk':
case 'apkdown':
case 'apkdl': {
    try {


        const q =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';

        const query = q.replace(/^\.(?:apk|apkdown|apkdl)\s+/i, '').trim();

        if (!query) {
            return await socket.sendMessage(sender, {
                text: '*`Need App Name or Keyword`*'
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        const apiUrl = `https://saviya-kolla-api.koyeb.app/download/apk?q=${encodeURIComponent(query)}`;
        const { data } = await axios.get(apiUrl);

        if (!data || !data.result) {
            return await socket.sendMessage(sender, {
                text: '*`No results found`*'
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        const result = data.result;
        const fuck = `Dᴛᴢ Mɪɴɪ Bᴏᴛ Aᴘᴋ Dʟ 📱`;
        
        const aliveText = `*📱 DEVELOPER NEXUS  APK DOWNLOADER 📱*\n\n╭━━━━━━━━━━━━━━━━━●◌\n*┊• ■ App :* ${String(result.name || 'N/A')}\n*┊• ■ Package :* ${String(result.package || 'N/A')}\n*┊• ■ Size :* ${String(result.size || 'N/A')}\n*┊• ■ Rating :* ${String(result.rating || 'N/A')}\n*╰━━━━━━━━━━━━━━━━━●◌*`;

        await socket.sendMessage(sender, {
            productMessage: {
                title: fuck,
                thumbnail: { url: result.icon },
                productId: "DEVELOPER NEXUS -APK-001",
                retailerId: "DEVELOPER NEXUS -TEAM",
                url: result.dllink,
                body: aliveText,
                footer: "> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*",
                priceAmount1000: 99999999900,
                currencyCode: "LKR",
                buttons: [
                    {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                            title: "Select Download Option",
                            sections: [
                                {
                                    title: "Download Options",
                                    rows: [
                                        {
                                            header: "APK FILE 📦",
                                            title: "Download as APK",
                                            description: "Standard APK file",
                                            id: `${sessionConfig.PREFIX}apkfile ${result.dllink}|||${result.name}`
                                        },
                                        {
                                            header: "DOCUMENT 📁",
                                            title: "Download as Document",
                                            description: "Save as document",
                                            id: `${sessionConfig.PREFIX}apkdoc ${result.dllink}|||${result.name}`
                                        }
                                    ]
                                }
                            ]
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Open on PlayStore 🔗",
                            url: `https://play.google.com/store/apps/details?id=${result.package}`
                        })
                    }
                ]
            }
        }, { quoted: DEVELOPER_NEXUS_minibot });

    } catch (e) {
        console.error(e);
        await socket.sendMessage(sender, {
            text: '*`Error occurred`*'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'apkfile': {
    try {

        const [dllink, appName] = args.join(' ').split('|||');

        if (!dllink) {
            return await socket.sendMessage(sender, {
                text: '*`Need download link`*'
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        await socket.sendMessage(sender, {
            document: { url: dllink },
            mimetype: 'application/vnd.android.package-archive',
            fileName: `${appName || 'app'}.apk`,
            caption: `*${appName || 'Application'}*\n\n> © ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });

    } catch (e) {
        console.error(e);
        await socket.sendMessage(sender, {
            text: '*`APK download error`*'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'apkdoc': {
    try {

        const [dllink, appName] = args.join(' ').split('|||');

        if (!dllink) {
            return await socket.sendMessage(sender, {
                text: '*`Need download link`*'
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        await socket.sendMessage(sender, {
            document: { url: dllink },
            mimetype: 'application/vnd.android.package-archive',
            fileName: `${appName || 'app'}.apk`,
            caption: `*${appName || 'Application'}*\n\n> © ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        }, { quoted: DEVELOPER_NEXUS_minibot });

    } catch (e) {
        console.error(e);
        await socket.sendMessage(sender, {
            text: '*`Document download error`*'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'happy':
    const happyLoadingMessage = await socket.sendMessage(sender, { text: '😂' }, { quoted: DEVELOPER_NEXUS_minibot });
    const happyEmojis = [
        "😃", "😄", "😁", "😊", "😎", "🥳",
        "😸", "😹", "🌞", "🌈", "😃", "😄",
        "😁", "😊", "😎", "🥳", "😸", "😹",
        "🌞", "🌈", "😃", "😄", "😁", "😊"
    ];
    for (const emoji of happyEmojis) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await socket.relayMessage(
            sender,
            {
                protocolMessage: {
                    key: happyLoadingMessage.key,
                    type: 14,
                    editedMessage: {
                        conversation: emoji
                    }
                }
            },
            {}
        );
    }
    break;
case 'heart':
    const heartLoadingMessage = await socket.sendMessage(sender, { text: '🖤' }, { quoted: DEVELOPER_NEXUS_minibot });
    const heartEmojis = [
        "💖", "💗", "💕", "🩷", "💛", "💚",
        "🩵", "💙", "💜", "🖤", "🩶", "🤍",
        "🤎", "❤️‍🔥", "💞", "💓", "💘", "💝",
        "♥️", "💟", "❤️‍🩹", "❤️"
    ];
    for (const emoji of heartEmojis) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await socket.relayMessage(
            sender,
            {
                protocolMessage: {
                    key: heartLoadingMessage.key,
                    type: 14,
                    editedMessage: {
                        conversation: emoji
                    }
                }
            },
            {}
        );
    }
    break;
case 'angry':
    const angryLoadingMessage = await socket.sendMessage(sender, { text: '👽' }, { quoted: DEVELOPER_NEXUS_minibot });
    const angryEmojis = [
        "😡", "😠", "🤬", "😤", "😾", "😡",
        "😠", "🤬", "😤", "😾"
    ];
    for (const emoji of angryEmojis) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await socket.relayMessage(
            sender,
            {
                protocolMessage: {
                    key: angryLoadingMessage.key,
                    type: 14,
                    editedMessage: {
                        conversation: emoji
                    }
                }
            },
            {}
        );
    }
    break;
case 'sad':
    const sadLoadingMessage = await socket.sendMessage(sender, { text: '😔' }, { quoted: DEVELOPER_NEXUS_minibot });
    const sadEmojis = [
        "🥺", "😟", "😕", "😖", "😫", "🙁",
        "😩", "😥", "😓", "😪", "😢", "😔",
        "😞", "😭", "💔", "😭", "😿"
    ];
    for (const emoji of sadEmojis) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await socket.relayMessage(
            sender,
            {
                protocolMessage: {
                    key: sadLoadingMessage.key,
                    type: 14,
                    editedMessage: {
                        conversation: emoji
                    }
                }
            },
            {}
        );
    }
    break;
case 'shy':
    const shyLoadingMessage = await socket.sendMessage(sender, { text: '🧐' }, { quoted: DEVELOPER_NEXUS_minibot });
    const shyEmojis = [
        "😳", "😊", "😶", "🙈", "🙊",
        "😳", "😊", "😶", "🙈", "🙊"
    ];
    for (const emoji of shyEmojis) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await socket.relayMessage(
            sender,
            {
                protocolMessage: {
                    key: shyLoadingMessage.key,
                    type: 14,
                    editedMessage: {
                        conversation: emoji
                    }
                }
            },
            {}
        );
    }
    break;
case 'moon':
    const moonLoadingMessage = await socket.sendMessage(sender, { text: '🌝' }, { quoted: DEVELOPER_NEXUS_minibot });
    const moonEmojis = [
        "🌗", "🌘", "🌑", "🌒", "🌓", "🌔",
        "🌕", "🌖", "🌗", "🌘", "🌑", "🌒",
        "🌓", "🌔", "🌕", "🌖", "🌗", "🌘",
        "🌑", "🌒", "🌓", "🌔", "🌕", "🌖",
        "🌗", "🌘", "🌑", "🌒", "🌓", "🌔",
        "🌕", "🌖", "🌝🌚"
    ];
    for (const emoji of moonEmojis) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await socket.relayMessage(
            sender,
            {
                protocolMessage: {
                    key: moonLoadingMessage.key,
                    type: 14,
                    editedMessage: {
                        conversation: emoji
                    }
                }
            },
            {}
        );
    }
    break;
case 'confused':
    const confusedLoadingMessage = await socket.sendMessage(sender, { text: '🤔' }, { quoted: DEVELOPER_NEXUS_minibot });
    const confusedEmojis = [
        "😕", "😟", "😵", "🤔", "😖",
        "😲", "😦", "🤷", "🤷‍♂️", "🤷‍♀️"
    ];
    for (const emoji of confusedEmojis) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await socket.relayMessage(
            sender,
            {
                protocolMessage: {
                    key: confusedLoadingMessage.key,
                    type: 14,
                    editedMessage: {
                        conversation: emoji
                    }
                }
            },
            {}
        );
    }
    break;

case 'joke': {


    try {
        await socket.sendMessage(sender, { react: { text: '😂', key: msg.key } });

        const response = await axios.get('https://official-joke-api.appspot.com/random_joke');
        const joke = response.data;

        let jokeText = `*😂 RANDOM JOKE*\n\n`;
        jokeText += `*${joke.setup}*\n\n`;
        jokeText += `*Punchline:* ${joke.punchline}\n\n`;
        jokeText += `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

        await socket.sendMessage(sender, { text: jokeText }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Joke Error:', err);
        await socket.sendMessage(sender, { text: '*❌ Failed to fetch joke!*' });
    }
    break;
}

case 'fact': {
    

    try {
        await socket.sendMessage(sender, { react: { text: '🧠', key: msg.key } });

        const response = await axios.get('https://uselessfacts.jsph.pl/random.json?language=en');
        const fact = response.data;

        let factText = `*🧠 RANDOM FACT*\n\n`;
        factText += `${fact.text}\n\n`;
        factText += `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

        await socket.sendMessage(sender, { text: factText }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Fact Error:', err);
        await socket.sendMessage(sender, { text: '*❌ Failed to fetch fact!*' });
    }
    break;
}

case 'dice':
case 'roll': {
    try {
        await socket.sendMessage(sender, { react: { text: '🎲', key: msg.key } });

        const diceRoll = Math.floor(Math.random() * 6) + 1;
        const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

        let diceText = `*🎲 DICE ROLL*\n\n`;
        diceText += `${diceEmojis[diceRoll - 1]}\n\n`;
        diceText += `*You rolled a ${diceRoll}!*\n\n`;
        diceText += `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

        await socket.sendMessage(sender, { text: diceText }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Dice Error:', err);
        await socket.sendMessage(sender, { text: '*❌ Failed to roll dice!*' });
    }
    break;
}

case 'flip':
case 'coin':
case 'coinflip': {
    try {
        await socket.sendMessage(sender, { react: { text: '🪙', key: msg.key } });

        const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
        const emoji = result === 'Heads' ? '👑' : '🔄';

        let flipText = `*🪙 COIN FLIP*\n\n`;
        flipText += `${emoji}\n\n`;
        flipText += `*Result: ${result}!*\n\n`;
        flipText += `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

        await socket.sendMessage(sender, { text: flipText }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Coinflip Error:', err);
        await socket.sendMessage(sender, { text: '*❌ Failed to flip coin!*' });
    }
    break;
}

case '8ball':
case 'ask': {
    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || '';

    if (!q || q.trim() === '') {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please ask a question!* \n📋 Example: .8ball Will I be rich?' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '🔮', key: msg.key } });

        const responses = [
            'Yes, definitely! ✅',
            'It is certain! 💯',
            'Without a doubt! 🎯',
            'Yes, absolutely! ⭐',
            'You may rely on it! 🤝',
            'As I see it, yes! 👀',
            'Most likely! 📈',
            'Outlook good! 🌟',
            'Signs point to yes! ☝️',
            'Reply hazy, try again! 🌫️',
            'Ask again later! ⏰',
            'Better not tell you now! 🤐',
            'Cannot predict now! 🔄',
            'Concentrate and ask again! 🧘',
            'Don\'t count on it! ❌',
            'My reply is no! 🚫',
            'My sources say no! 📰',
            'Outlook not so good! 📉',
            'Very doubtful! 🤔',
            'Absolutely not! 💢'
        ];

        const answer = responses[Math.floor(Math.random() * responses.length)];

        let ballText = `*🔮 MAGIC 8 BALL*\n\n`;
        ballText += `*Question:* ${q.trim()}\n\n`;
        ballText += `*Answer:* ${answer}\n\n`;
        ballText += `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

        await socket.sendMessage(sender, { text: ballText }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('8Ball Error:', err);
        await socket.sendMessage(sender, { text: '*❌ Magic 8 Ball is broken!*' });
    }
    break;
}

case 'ship': {
    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || '';

    const parts = q.trim().split('&');
    if (parts.length !== 2) {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please provide two names!* \n📋 Example: .ship John & Jane' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '💕', key: msg.key } });

        const name1 = parts[0].trim();
        const name2 = parts[1].trim();
        
        const combined = name1.toLowerCase() + name2.toLowerCase();
        let hash = 0;
        for (let i = 0; i < combined.length; i++) {
            hash = combined.charCodeAt(i) + ((hash << 5) - hash);
        }
        const percentage = Math.abs(hash % 101);

        let hearts = '';
        if (percentage >= 90) hearts = '💖💖💖💖💖';
        else if (percentage >= 70) hearts = '💖💖💖💖';
        else if (percentage >= 50) hearts = '💖💖💖';
        else if (percentage >= 30) hearts = '💖💖';
        else hearts = '💖';

        let shipText = `*💕 LOVE CALCULATOR*\n\n`;
        shipText += `*${name1}* 💑 *${name2}*\n\n`;
        shipText += `${hearts}\n`;
        shipText += `*Love Percentage:* ${percentage}%\n\n`;
        
        if (percentage >= 80) shipText += `*Perfect Match! 🔥💕*`;
        else if (percentage >= 60) shipText += `*Great Chemistry! ✨💝*`;
        else if (percentage >= 40) shipText += `*Good Potential! 💫💓*`;
        else if (percentage >= 20) shipText += `*Needs Work! 🤔💔*`;
        else shipText += `*Not Meant To Be! 😢💔*`;
        
        shipText += `\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

        await socket.sendMessage(sender, { text: shipText }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Ship Error:', err);
        await socket.sendMessage(sender, { text: '*❌ Love calculator failed!*' });
    }
    break;
}

case 'compliment': {
    try {
        await socket.sendMessage(sender, { react: { text: '🌟', key: msg.key } });

        const compliments = [
            'You\'re an awesome person! 🌟',
            'You light up the room! ✨',
            'You\'re incredibly smart! 🧠',
            'You have the best laugh! 😄',
            'You\'re a great friend! 🤝',
            'You\'re more fun than bubble wrap! 🎈',
            'You\'re amazing just the way you are! 💯',
            'You\'re a gift to those around you! 🎁',
            'You\'re a smart cookie! 🍪',
            'You\'re awesome sauce! 🔥',
            'You\'re one of a kind! 💎',
            'You\'re inspiring! 🌈',
            'You\'re a ray of sunshine! ☀️',
            'You make my day better! 😊',
            'You\'re stronger than you think! 💪'
        ];

        const compliment = compliments[Math.floor(Math.random() * compliments.length)];

        let complimentText = `*🌟 COMPLIMENT FOR YOU*\n\n`;
        complimentText += `${compliment}\n\n`;
        complimentText += `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

        await socket.sendMessage(sender, { text: complimentText }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Compliment Error:', err);
        await socket.sendMessage(sender, { text: '*❌ Failed to send compliment!*' });
    }
    break;
}

case 'roast': {
    try {
        await socket.sendMessage(sender, { react: { text: '🔥', key: msg.key } });

        const roasts = [
            'I\'d agree with you, but then we\'d both be wrong! 😏',
            'You\'re not stupid, you just have bad luck thinking! 🤔',
            'If I had a dollar for every smart thing you said, I\'d be broke! 💸',
            'You bring everyone so much joy... when you leave! 👋',
            'I\'m not saying you\'re dumb, I\'m just saying you have bad luck when it comes to thinking! 🧠',
            'You\'re like a cloud. When you disappear, it\'s a beautiful day! ☁️',
            'I\'d call you a tool, but that would imply you were useful! 🔧',
            'You\'re proof that evolution can go in reverse! 🦍',
            'Somewhere out there is a tree tirelessly producing oxygen for you. You owe it an apology! 🌳',
            'If you were any more inbred, you\'d be a sandwich! 🥪'
        ];

        const roast = roasts[Math.floor(Math.random() * roasts.length)];

        let roastText = `*🔥 YOU JUST GOT ROASTED*\n\n`;
        roastText += `${roast}\n\n`;
        roastText += `*Just kidding! You\'re awesome! 😄*\n\n`;
        roastText += `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

        await socket.sendMessage(sender, { text: roastText }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Roast Error:', err);
        await socket.sendMessage(sender, { text: '*❌ Failed to roast!*' });
    }
    break;
}

case 'pick':
case 'choose': {
    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || '';

    const options = q.trim().split(',').map(opt => opt.trim()).filter(opt => opt);
    
    if (options.length < 2) {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please provide at least 2 options!* \n📋 Example: .pick pizza, burger, pasta' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '🤔', key: msg.key } });

        const choice = options[Math.floor(Math.random() * options.length)];

        let pickText = `*🎯 RANDOM CHOICE*\n\n`;
        pickText += `*Options:*\n`;
        options.forEach((opt, i) => {
            pickText += `${i + 1}. ${opt}\n`;
        });
        pickText += `\n*I choose:* ${choice} ✨\n\n`;
        pickText += `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

        await socket.sendMessage(sender, { text: pickText }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Pick Error:', err);
        await socket.sendMessage(sender, { text: '*❌ Failed to pick!*' });
    }
    break;
}

case 'rate': {
    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || '';

    if (!q || q.trim() === '') {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please provide something to rate!* \n📋 Example: .rate my coding skills' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '⭐', key: msg.key } });

        const rating = Math.floor(Math.random() * 11);
        const stars = '⭐'.repeat(rating);

        let rateText = `*⭐ RATING*\n\n`;
        rateText += `*Item:* ${q.trim()}\n\n`;
        rateText += `${stars}\n`;
        rateText += `*Rating:* ${rating}/10\n\n`;
        
        if (rating >= 8) rateText += `*Excellent! 🔥*`;
        else if (rating >= 6) rateText += `*Pretty Good! 👍*`;
        else if (rating >= 4) rateText += `*Average! 😐*`;
        else rateText += `*Needs Improvement! 📉*`;
        
        rateText += `\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

        await socket.sendMessage(sender, { text: rateText }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Rate Error:', err);
        await socket.sendMessage(sender, { text: '*❌ Failed to rate!*' });
    }
    break;
}

case 'cid':
case 'cinfo':
case 'channelinfo': {
    await socket.sendMessage(sender, {
        react: { text: '📡', key: msg.key }
    });
    const cidQ =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption || '';
    const cidQuery = cidQ.replace(/^[.\/!](cid|cinfo|channelinfo)\s*/i, '').trim();
    if (!cidQuery) {
        return socket.sendMessage(sender, {
            text: '❎ Please provide a WhatsApp Channel link.\n\n📌 *Example:* .cid https://whatsapp.com/channel/123456789'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    const match = cidQuery.match(/whatsapp\.com\/channel\/([\w-]+)/);
    if (!match) {
        return socket.sendMessage(sender, {
            text: '⚠️ *Invalid channel link format.*\n\nhttps://whatsapp.com/channel/xxxxxxxx'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    try {
        const inviteId = match[1];
        const metadata = await socket.newsletterMetadata('invite', inviteId);

        if (!metadata?.id) throw 'Not found';
        const created =
            metadata.creationTime
                ? new Date(metadata.creationTime * 1000).toLocaleString()
                : 'Unknown';
        
        const infoText = `■ *Cʜᴀɴɴᴇʟ Iᴅ :* ${metadata.id}
■ *Cʜᴀɴɴᴇʟ Nᴀᴍᴇ :* ${metadata.name}
■ *Cʜᴀɴɴᴇʟ Fᴏʟʟᴏᴡᴇʀꜱ :* ${metadata.subscribersCount?.toLocaleString() || 'N/A'}
■ *Cʜᴀɴɴᴇʟ Cʀᴇᴀᴛᴇᴅ Oɴ:* ${created}

> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`;

        const channelMsg = generateWAMessageFromContent(sender, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                        body: proto.Message.InteractiveMessage.Body.create({
                            text: infoText
                        }),
                        header: proto.Message.InteractiveMessage.Header.create({
                            title: '*📡 CHANNEL INFO ✅*',
                            subtitle: '',
                            hasMediaAttachment: false
                        }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                            buttons: [
                                {
                                    name: 'cta_copy',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: 'Copy JID',
                                        id: metadata.id,
                                        copy_code: metadata.id
                                    })
                                }
                            ]
                        })
                    })
                }
            }
        }, {});
        
        await socket.relayMessage(sender, channelMsg.message, {
            quoted: DEVELOPER_NEXUS_minibot
        });

        await socket.sendMessage(sender, {
            react: { text: '✅', key: msg.key }
        });
    } catch (e) {
        await socket.sendMessage(sender, {
            text: '❌ Channel not found or inaccessible.\n\n• Invalid invite link\n• Private channel\n• Deleted channel'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }
    break;
}

case 'cinfo2': {
  const q = msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption || '';

  const channelLink = q.replace(/^[./!]cinfo\s*/i, '').trim();

  if (!channelLink) {
    return await socket.sendMessage(sender, {
      text: '❎ Please provide a WhatsApp Channel link.\n\n📌 Example: .cinfo https://whatsapp.com/channel/123456789'
    }, { quoted: DEVELOPER_NEXUS_minibot });
  }

  const match = channelLink.match(/whatsapp\.com\/channel\/([\w-]+)/);
  if (!match) {
    return await socket.sendMessage(sender, {
      text: '⚠️ Invalid channel link format.\n\nMake sure it looks like:\nhttps://whatsapp.com/channel/xxxxxxxxx'
    }, { quoted: DEVELOPER_NEXUS_minibot });
  }

  const inviteId = match[1];

  try {
    await socket.sendMessage(sender, {
      react: { text: '🔎', key: msg.key }
    });

    const metadata = await socket.newsletterMetadata("invite", inviteId);

    if (!metadata || !metadata.id) {
      return await socket.sendMessage(sender, {
        text: '❌ Channel not found or inaccessible.'
      }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    const created = metadata.creation_time
      ? new Date(metadata.creation_time * 1000).toLocaleString("id-ID")
      : 'Unknown';

    const infoText = `■ *Cʜᴀɴɴᴇʟ Iᴅ :* ${metadata.id}
■ *Cʜᴀɴɴᴇʟ Nᴀᴍᴇ :* ${metadata.name}
■ *Cʜᴀɴɴᴇʟ Fᴏʟʟᴏᴡᴇʀꜱ :* ${metadata.subscribers?.toLocaleString() || 'N/A'}
■ *Cʜᴀɴɴᴇʟ Cʀᴇᴀᴛᴇᴅ Oɴ :* ${created}
■ *Cʜᴀɴɴᴇʟ Aʙᴏᴜᴛ :* ${metadata.description || 'N/A'}

> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

    const buttonMsg = generateWAMessageFromContent(sender, {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2
          },
          interactiveMessage: proto.Message.InteractiveMessage.create({
            body: proto.Message.InteractiveMessage.Body.create({
              text: infoText
            }),
            header: proto.Message.InteractiveMessage.Header.create({
              title: '*📡 CHANNEL INFO ✅*',
              hasMediaAttachment: false
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
              buttons: [
                {
                  name: 'cta_url',
                  buttonParamsJson: JSON.stringify({
                    display_text: '🔗 Open Channel',
                    url: `https://whatsapp.com/channel/${inviteId}`,
                    merchant_url: `https://whatsapp.com/channel/${inviteId}`
                  })
                },
                {
                  name: 'cta_copy',
                  buttonParamsJson: JSON.stringify({
                    display_text: '📋 Copy Channel ID',
                    id: metadata.id,
                    copy_code: metadata.id
                  })
                }
              ]
            })
          })
        }
      }
    }, {});

    let previewUrl = metadata.preview;
    if (previewUrl) {
      if (!previewUrl.startsWith('https://')) {
        previewUrl = `https://pps.whatsapp.net${previewUrl}`;
      }
      await socket.sendMessage(sender, {
        image: { url: previewUrl },
        caption: '🖼️ *Channel Preview Image*'
      }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    await socket.relayMessage(sender, buttonMsg.message, {
      messageId: buttonMsg.key.id
    });

    await socket.sendMessage(sender, {
      react: { text: '✅', key: msg.key }
    });

  } catch (err) {
    console.error("CID command error:", err);
    await socket.sendMessage(sender, {
      react: { text: '❌', key: msg.key }
    });
    await socket.sendMessage(sender, {
      text: '⚠️ An unexpected error occurred while fetching channel info.\n\n• Invalid link\n• Private channel\n• Deleted channel'
    }, { quoted: DEVELOPER_NEXUS_minibot });
  }

  break;
}
    
case 'animeimg1':
    await socket.sendMessage(sender, {
        react: {
            text: '🧚‍♀️',
            key: msg.key
        }
    });
    
    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/aD7t0Bc.jpg` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/PQO5wPN.jpg` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/5At1P4A.jpg` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/MjtH3Ha.jpg` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/QQW7VKy.jpg` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    break;

case 'animeimg2':
    await socket.sendMessage(sender, {
        react: {
            text: '🧚‍♀️',
            key: msg.key
        }
    });
    
    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/0r1Bn88.jpg` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/2Xdpuov.png` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/0hx-3AP.png` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/q054x0_.png` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/4lyqRvd.jpg` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    break;

case 'animeimg3':
    await socket.sendMessage(sender, {
        react: {
            text: '🧚‍♀️',
            key: msg.key
        }
    });
    
    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/gnpc_Lr.jpeg` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/P6X-ph6.jpg` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/~p5W9~k.png` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/7Apu5C9.jpg` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/OTRfON6.jpg` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    break;

case 'animeimg4':
    await socket.sendMessage(sender, {
        react: {
            text: '🧚‍♀️',
            key: msg.key
        }
    });
    
    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/aGgUm80.jpg` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/i~RQhRD.png` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/94LH-aU.jpg` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/V8hvqfK.jpg` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/lMiXE7j.png` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    break;

case 'animeimg5':
    await socket.sendMessage(sender, {
        react: {
            text: '🧚‍♀️',
            key: msg.key
        }
    });
    
    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/-ABlAvr.jpg` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/HNEg0-Q.png` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/3x~ovC6.jpg` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/brv-GJu.jpg` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        image: { url: `https://i.waifu.pics/FWE8ggD.png` },
        caption: '> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
    }, { quoted: DEVELOPER_NEXUS_minibot });

    break;

case 'yts2':
case 'ytsearch2': {
    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || 
              msg.message?.imageMessage?.caption || 
              msg.message?.videoMessage?.caption || '';

    if (!q || q.trim() === '') {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please provide a search query!* \n📋 Example: .yts Believer' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

        const search = await yts(q.trim());
        const videos = search.videos.slice(0, 10);

        if (videos.length === 0) {
            return await socket.sendMessage(sender, { text: '*❌ No results found!*' });
        }

        let resultText = `*🎥 YOUTUBE SEARCH RESULTS*\n\n`;
        resultText += `*Search Query:* ${q.trim()}\n`;
        resultText += `*Results Found:* ${videos.length}\n\n`;
        resultText += `*╭───────────────────────*\n`;

        videos.forEach((video, index) => {
            resultText += `*${index + 1}.* ${video.title}\n`;
            resultText += `*├ Duration:* ${video.timestamp}\n`;
            resultText += `*├ Views:* ${video.views}\n`;
            resultText += `*├ Uploaded:* ${video.ago}\n`;
            resultText += `*├ Channel:* ${video.author.name}\n`;
            resultText += `*└ URL:* ${video.url}\n\n`;
        });

        resultText += `*╰───────────────────────*\n\n`;
        resultText += `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

        await socket.sendMessage(sender, { 
            text: resultText 
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('YT Search Error:', err);
        await socket.sendMessage(sender, { 
            text: `*⚠️ Search failed!* \n🔄 Details: ${err.message}` 
        });
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
    }
    break;
}

case 'forward':
case 'fo': {
    await socket.sendMessage(sender, {
        react: { text: '📤', key: msg.key }
    });

    if (!isOwner) {
        return await socket.sendMessage(sender, {
            text: "*Owner Only ❌*"
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    const forwardQ = msg.message?.conversation || 
                     msg.message?.extendedTextMessage?.text || 
                     msg.message?.imageMessage?.caption || 
                     msg.message?.videoMessage?.caption || '';
    
    const forwardQuery = forwardQ.split(' ').slice(1).join(' ').trim();
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!forwardQuery || !quotedMsg) {
        return await socket.sendMessage(sender, {
            text: "*Provide the message and JID(s) ❌*\n\nExample: `.forward 94xxxxxxxxx@s.whatsapp.net`"
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    let jidList = forwardQuery.split(",").map((jid) => jid.trim());
    let forwardedTo = [];
    
    for (let jid of jidList) {
        await socket.sendMessage(jid, { 
            forward: { 
                key: { remoteJid: sender, fromMe: false, id: msg.message.extendedTextMessage.contextInfo.stanzaId }, 
                message: quotedMsg 
            } 
        });
        forwardedTo.push(jid);
    }

    await socket.sendMessage(sender, {
        text: forwardedTo.length > 0
            ? "*Message successfully forwarded to:*\n\n" + forwardedTo.join("\n") + "\n\n> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ"
            : "*Failed to forward to all provided JIDs ❌*"
    }, { quoted: DEVELOPER_NEXUS_minibot });

    break;
}

case 'Broadchat':
case 'bc': {
    await socket.sendMessage(sender, {
        react: { text: '📤', key: msg.key }
    });

    if (!isGroup) {
        return await socket.sendMessage(sender, {
            text: "❌ This command only works in groups."
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    const sendallQ = msg.message?.conversation || 
                     msg.message?.extendedTextMessage?.text || 
                     msg.message?.imageMessage?.caption || 
                     msg.message?.videoMessage?.caption || '';
    
    const sendallQuery = sendallQ.split(' ').slice(1).join(' ').trim();

    if (!sendallQuery) {
        return await socket.sendMessage(sender, {
            text: "*Please provide a message to send...*\n\nExample: `.bc Hello everyone!`"
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    const groupParticipants = groupMetadata.participants;

    await socket.sendMessage(sender, {
        text: `*Sending your message to ${groupParticipants.length - 1} members... 📤*`
    }, { quoted: DEVELOPER_NEXUS_minibot });

    let successfulSends = 0;

    for (const participant of groupParticipants) {
        const participantId = participant.id;
        if (participantId.includes(botNumber)) continue;

        await socket.sendMessage(participantId, {
            text: `📢 *Group Broadcast Message :*\n\n${sendallQuery}\n\n> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`
        });
        successfulSends++;
    }

    await socket.sendMessage(sender, {
        text: `*Message sent to ${successfulSends} members... 🧑‍💻*`
    }, { quoted: DEVELOPER_NEXUS_minibot });

    break;
}

case 'google2':
case 'gsearch': {
    await socket.sendMessage(sender, {
        react: { text: '🔍', key: msg.key }
    });

    const googleQ = msg.message?.conversation || 
                    msg.message?.extendedTextMessage?.text || 
                    msg.message?.imageMessage?.caption || 
                    msg.message?.videoMessage?.caption || '';
    
    const googleQuery = googleQ.split(' ').slice(1).join(' ').trim();

    if (!googleQuery) {
        return await socket.sendMessage(sender, {
            text: '⚠️ *Please provide a search query.*\n\n*Example:*\n.google how to code in javascript'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    await socket.sendMessage(sender, {
        text: `🔎 Searching for: *${googleQuery}*`
    }, { quoted: DEVELOPER_NEXUS_minibot });

    const apiKey = "AIzaSyDMbI3nvmQUrfjoCJYLS69Lej1hSXQjnWI";
    const cx = "baf9bdb0c631236e5";
    const apiUrl = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(googleQuery)}&key=${apiKey}&cx=${cx}`;

    const googleResponse = await axios.get(apiUrl);

    if (googleResponse.status !== 200 || !googleResponse.data.items || googleResponse.data.items.length === 0) {
        return await socket.sendMessage(sender, {
            text: `⚠️ *No results found for:* ${googleQuery}`
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    let results = `🔍 *Google Search Results for:* "${googleQuery}"\n\n`;
    
    googleResponse.data.items.slice(0, 5).forEach((item, index) => {
        results += `*${index + 1}. ${item.title}*\n\n🔗 ${item.link}\n\n📝 ${item.snippet}\n\n`;
    });

    results += `> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ`;

    const firstResult = googleResponse.data.items[0];
    const thumbnailUrl = firstResult.pagemap?.cse_image?.[0]?.src || 
                        firstResult.pagemap?.cse_thumbnail?.[0]?.src || 
                        'https://via.placeholder.com/150';

    await socket.sendMessage(sender, {
        image: { url: thumbnailUrl },
        caption: results.trim(),
        contextInfo: {
            mentionedJid: [sender],
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: '120363401720377971@newsletter',
                newsletterName: "ᴅᴛᴢ ᴍɪɴɪ ʙᴏᴛ ᴠ3 📌",
                serverMessageId: 143,
            },
        }
    }, { quoted: DEVELOPER_NEXUS_minibot });

    await socket.sendMessage(sender, {
        react: { text: '✅', key: msg.key }
    });

    break;
}

case 'img':
case 'image':
case 'imgsearch': {
    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || 
              msg.message?.imageMessage?.caption || 
              msg.message?.videoMessage?.caption || '';

    if (!q || q.trim() === '') {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please provide a search query!* \n📋 Example: .img cute puppies' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '🖼️', key: msg.key } });

        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(q.trim())}&tbm=isch`;
        
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const images = [];

        $('img').each((i, elem) => {
            const src = $(elem).attr('src');
            if (src && src.startsWith('http') && !src.includes('google')) {
                images.push(src);
            }
        });

        if (images.length === 0) {
            return await socket.sendMessage(sender, { 
                text: '*❌ No images found!*' 
            });
        }

        const imagesToSend = images.slice(0, 5);
        
        for (let i = 0; i < imagesToSend.length; i++) {
            await socket.sendMessage(sender, {
                image: { url: imagesToSend[i] },
                caption: `*🖼️ Image ${i + 1}/${imagesToSend.length}*\n*Query:* ${q.trim()}\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
            });
        }

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Image Search Error:', err);
        await socket.sendMessage(sender, { 
            text: `*⚠️ Image search failed!* \n🔄 Details: ${err.message}` 
        });
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
    }
    break;
}

case 'add': {
    if (!isOwner) {
        return await socket.sendMessage(sender, {
            text: '👥 This command use only owner.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    if (!isGroup) {
        return await socket.sendMessage(sender, {
            text: '👥 This command use only group.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || '';

    const number = q.trim().replace(/[^0-9]/g, '');
    if (!number) {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please provide a phone number!* \n📋 Example: .add 94712345678' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '➕', key: msg.key } });

        const userJid = number + '@s.whatsapp.net';
        await socket.groupParticipantsUpdate(msg.key.remoteJid, [userJid], 'add');

        await socket.sendMessage(sender, { 
            text: `*✅ Successfully added +${number} to the group!*` 
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Add Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Failed to add member!*\n*Reason:* ${err.message}` 
        });
    }
    break;
}

case 'kick':
case 'remove': {
    if (!isOwner) {
        return await socket.sendMessage(sender, {
            text: '👥 This command use only owner.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

   if (!isGroup) {
        return await socket.sendMessage(sender, {
            text: '👥 This command use only group.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    if (!mentionedJid) {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please tag a member to remove!* \n📋 Example: .kick @user' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '🚫', key: msg.key } });

        await socket.groupParticipantsUpdate(msg.key.remoteJid, [mentionedJid], 'remove');

        await socket.sendMessage(sender, { 
            text: `*✅ Successfully removed @${mentionedJid.split('@')[0]} from the group!*`,
            mentions: [mentionedJid]
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Kick Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Failed to remove member!*\n*Reason:* ${err.message}` 
        });
    }
    break;
}

case 'promote': {
    if (!isOwner) {
        return await socket.sendMessage(sender, {
            text: '👥 This command use only owner.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

   if (!isGroup) {
        return await socket.sendMessage(sender, {
            text: '👥 This command use only group.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    if (!mentionedJid) {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please tag a member to promote!* \n📋 Example: .promote @user' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '⬆️', key: msg.key } });

        await socket.groupParticipantsUpdate(msg.key.remoteJid, [mentionedJid], 'promote');

        await socket.sendMessage(sender, { 
            text: `*✅ Successfully promoted @${mentionedJid.split('@')[0]} to admin!* 👑`,
            mentions: [mentionedJid]
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Promote Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Failed to promote member!*\n*Reason:* ${err.message}` 
        });
    }
    break;
}

case 'demote': {
    if (!isOwner) {
        return await socket.sendMessage(sender, {
            text: '👥 This command use only owner.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

   if (!isGroup) {
        return await socket.sendMessage(sender, {
            text: '👥 This command use only group.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    if (!mentionedJid) {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please tag an admin to demote!* \n📋 Example: .demote @user' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        await socket.groupParticipantsUpdate(msg.key.remoteJid, [mentionedJid], 'demote');

        await socket.sendMessage(sender, { 
            text: `*✅ Successfully demoted @${mentionedJid.split('@')[0]} to member!*`,
            mentions: [mentionedJid]
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Demote Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Failed to demote member!*\n*Reason:* ${err.message}` 
        });
    }
    break;
}

case 'mute': {
    if (!isOwner) {
        return await socket.sendMessage(sender, {
            text: '👥 This command use only owner.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

   if (!isGroup) {
        return await socket.sendMessage(sender, {
            text: '👥 This command use only group.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '🔇', key: msg.key } });
        await socket.groupSettingUpdate(msg.key.remoteJid, 'announcement');
        await socket.sendMessage(sender, { 
            text: '*🔇 Group has been muted! Only admins can send messages.*' 
        }, { quoted: msg });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (err) {
        console.error('Mute Error:', err);
        await socket.sendMessage(sender, { text: `*❌ Failed to mute group!*` });
    }
    break;
}

case 'unmute': {
    if (!isOwner) {
        return await socket.sendMessage(sender, {
            text: '👥 This command use only owner.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

   if (!isGroup) {
        return await socket.sendMessage(sender, {
            text: '👥 This command use only group.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '🔊', key: msg.key } });
        await socket.groupSettingUpdate(msg.key.remoteJid, 'not_announcement');
        await socket.sendMessage(sender, { 
            text: '*🔊 Group has been unmuted! Everyone can send messages.*' 
        }, { quoted: DEVELOPER_NEXUS_minibot });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (err) {
        console.error('Unmute Error:', err);
        await socket.sendMessage(sender, { text: `*❌ Failed to unmute group!*` });
    }
    break;
}

case 'anime': {


    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || '';

    if (!q || q.trim() === '') {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please provide an anime name!* \n📋 Example: .anime Naruto' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

        const apiUrl = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q.trim())}&limit=1`;
        const response = await axios.get(apiUrl);
        const anime = response.data.data[0];

        if (!anime) {
            return await socket.sendMessage(sender, { 
                text: '*❌ Anime not found!*' 
            });
        }

        let animeText = `*🎌 ANIME INFORMATION*\n\n`;
        animeText += `*Title:* ${anime.title}\n`;
        animeText += `*Japanese:* ${anime.title_japanese || 'N/A'}\n`;
        animeText += `*Type:* ${anime.type || 'N/A'}\n`;
        animeText += `*Episodes:* ${anime.episodes || 'N/A'}\n`;
        animeText += `*Status:* ${anime.status || 'N/A'}\n`;
        animeText += `*Score:* ${anime.score || 'N/A'}/10 ⭐\n`;
        animeText += `*Rank:* #${anime.rank || 'N/A'}\n`;
        animeText += `*Popularity:* #${anime.popularity || 'N/A'}\n`;
        animeText += `*Genres:* ${anime.genres?.map(g => g.name).join(', ') || 'N/A'}\n`;
        animeText += `*Studios:* ${anime.studios?.map(s => s.name).join(', ') || 'N/A'}\n`;
        animeText += `*Aired:* ${anime.aired?.string || 'N/A'}\n\n`;
        animeText += `*Synopsis:*\n${anime.synopsis || 'No synopsis available'}\n\n`;
        animeText += `*URL:* ${anime.url}\n\n`;
        animeText += `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

        if (anime.images?.jpg?.large_image_url) {
            await socket.sendMessage(sender, {
                image: { url: anime.images.jpg.large_image_url },
                caption: animeText
            }, { quoted: DEVELOPER_NEXUS_minibot });
        } else {
            await socket.sendMessage(sender, { text: animeText }, { quoted: DEVELOPER_NEXUS_minibot });
        }

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Anime Search Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Failed to search anime!*\n*Error:* ${err.message}` 
        });
    }
    break;
}

case 'animewallpaper':
case 'animewall': {


    try {
        await socket.sendMessage(sender, { react: { text: '🖼️', key: msg.key } });

        const apiUrl = 'https://api.waifu.pics/sfw/waifu';
        const response = await axios.get(apiUrl);
        const imageUrl = response.data.url;

        await socket.sendMessage(sender, {
            image: { url: imageUrl },
            caption: '*🖼️ Random Anime Wallpaper*\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*'
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Anime Wallpaper Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Failed to fetch anime wallpaper!*` 
        });
    }
    break;
}

case 'animegirl':
case 'animegirl1':
case 'animegirl2':
case 'animegirl3':
case 'animegirl4':
case 'animegirl5': {

    
    try {
        await socket.sendMessage(sender, { react: { text: '👧', key: msg.key } });
        
        const apiUrl = 'https://api.waifu.pics/sfw/waifu';
        const response = await axios.get(apiUrl);
        const data = response.data;
        
        await socket.sendMessage(sender, { 
            image: { url: data.url }, 
            caption: '👸 *ᴅᴇᴠɪʟ-ᴛᴇᴄʜ-ᴍᴅ ʀᴀɴᴅᴏᴍ ᴀɴɪᴍᴇ ɢɪʀʟ ɪᴍᴀɢᴇs* 👸\n\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ™❗*' 
        }, { quoted: DEVELOPER_NEXUS_minibot });
        
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
        
    } catch (e) {
        console.log(e);
        await socket.sendMessage(sender, { 
            text: `*Error Fetching Anime Girl image*: ${e.message}` 
        });
    }
    break;
}

case 'loli':
case 'imgloli': {

    
    try {
        await socket.sendMessage(sender, { react: { text: '🧧', key: msg.key } });
        
        const res = await axios.get('https://api.lolicon.app/setu/v2?num=1&r18=0&tag=lolicon');
        const wm = `🧧 Random loli image\n\n*© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ™❗*`;
        
        await socket.sendMessage(sender, { 
            image: { url: res.data.data[0].urls.original }, 
            caption: wm 
        }, { quoted: DEVELOPER_NEXUS_minibot });
        
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
        
    } catch (e) {
        console.log(e);
        await socket.sendMessage(sender, { 
            text: '*❌ Failed to fetch loli image!*' 
        });
    }
    break;
}

case 'waifu':
case 'imgwaifu': {

    
    try {
        await socket.sendMessage(sender, { react: { text: '🧧', key: msg.key } });
        
        const res = await axios.get('https://api.waifu.pics/sfw/waifu');
        const wm = `🧧 Random Waifu image\n\n*© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ™❗*`;
        
        await socket.sendMessage(sender, { 
            image: { url: res.data.url }, 
            caption: wm 
        }, { quoted: DEVELOPER_NEXUS_minibot });
        
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
        
    } catch (e) {
        console.log(e);
        await socket.sendMessage(sender, { 
            text: '*❌ Failed to fetch waifu image!*' 
        });
    }
    break;
}

case 'neko':
case 'imgneko': {

    
    try {
        await socket.sendMessage(sender, { react: { text: '💫', key: msg.key } });
        
        const res = await axios.get('https://api.waifu.pics/sfw/neko');
        const wm = `🧧 Random neko image\n\n*© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ™❗*`;
        
        await socket.sendMessage(sender, { 
            image: { url: res.data.url }, 
            caption: wm 
        }, { quoted: DEVELOPER_NEXUS_minibot });
        
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
        
    } catch (e) {
        console.log(e);
        await socket.sendMessage(sender, { 
            text: '*❌ Failed to fetch neko image!*' 
        });
    }
    break;
}

case 'megumin':
case 'imgmegumin': {

    
    try {
        await socket.sendMessage(sender, { react: { text: '🧧', key: msg.key } });
        
        const res = await axios.get('https://api.waifu.pics/sfw/megumin');
        const wm = `🧧 Random megumin image\n\n*© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ™❗*`;
        
        await socket.sendMessage(sender, { 
            image: { url: res.data.url }, 
            caption: wm 
        }, { quoted: DEVELOPER_NEXUS_minibot });
        
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
        
    } catch (e) {
        console.log(e);
        await socket.sendMessage(sender, { 
            text: '*❌ Failed to fetch megumin image!*' 
        });
    }
    break;
}

case 'maid':
case 'imgmaid': {

    
    try {
        await socket.sendMessage(sender, { react: { text: '💫', key: msg.key } });
        
        const res = await axios.get('https://api.waifu.im/search/?included_tags=maid');
        const wm = `🧧 Random maid image\n\n*© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ™❗*`;
        
        await socket.sendMessage(sender, { 
            image: { url: res.data.images[0].url }, 
            caption: wm 
        }, { quoted: DEVELOPER_NEXUS_minibot });
        
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
        
    } catch (e) {
        console.log(e);
        await socket.sendMessage(sender, { 
            text: '*❌ Failed to fetch maid image!*' 
        });
    }
    break;
}

case 'awoo':
case 'imgawoo': {

    
    try {
        await socket.sendMessage(sender, { react: { text: '🧧', key: msg.key } });
        
        const res = await axios.get('https://api.waifu.pics/sfw/awoo');
        const wm = `🧧 Random awoo image\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;
        
        await socket.sendMessage(sender, { 
            image: { url: res.data.url }, 
            caption: wm 
        }, { quoted: DEVELOPER_NEXUS_minibot });
        
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
        
    } catch (e) {
        console.log(e);
        await socket.sendMessage(sender, { 
            text: '*❌ Failed to fetch awoo image!*' 
        });
    }
    break;
}

case 'animeimg': {
    try {
        await socket.sendMessage(sender, { react: { text: '⛱️', key: msg.key } });
        
        const dec = `*DEVELOPER NEXUS  MINI BOT ANIME PHOTOS*\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;
        
        const images = [
            'https://telegra.ph/file/b26f27aa5daaada031b90.jpg',
            'https://telegra.ph/file/51b44e4b086667361061b.jpg',
            'https://telegra.ph/file/7d165d73f914985542537.jpg',
            'https://telegra.ph/file/3d9732d2657d2d72dc102.jpg',
            'https://files.catbox.moe/8qtrll.jpg',
            'https://files.catbox.moe/nvnw4b.jpg',
            'https://files.catbox.moe/vbhpm3.jpg',
            'https://files.catbox.moe/79tkqe.jpg',
            'https://files.catbox.moe/5r3673.jpg',
            'https://files.catbox.moe/j3wi95.jpg',
            'https://files.catbox.moe/i85g22.jpg',
            'https://files.catbox.moe/xmvplh.jpg',
            'https://files.catbox.moe/nqpfc5.jpg',
            'https://files.catbox.moe/2v3whm.jpg',
            'https://files.catbox.moe/odo2de.jpg',
            'https://files.catbox.moe/21dduy.jpg',
            'https://files.catbox.moe/4a6umh.jpg',
            'https://files.catbox.moe/qz26ij.jpg',
            'https://files.catbox.moe/fyewp9.jpg',
            'https://telegra.ph/file/8daf7e432a646f3ebe7eb.jpg',
            'https://telegra.ph/file/7514b18ea89da924e7496.jpg',
            'https://telegra.ph/file/ce9cb5acd2cec7693d76b.jpg'
        ];
        
        for (const imageUrl of images) {
            await socket.sendMessage(sender, { 
                image: { url: imageUrl }, 
                caption: dec 
            }, { quoted: DEVELOPER_NEXUS_minibot });
        }
        
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
        
    } catch (e) {
        console.log(e);
        await socket.sendMessage(sender, { 
            text: `*❌ Error:* ${e}` 
        });
    }
    break;
}

case 'waifu2': {


    try {
        await socket.sendMessage(sender, { react: { text: '👧', key: msg.key } });

        const apiUrl = 'https://api.waifu.pics/sfw/waifu';
        const response = await axios.get(apiUrl);
        const imageUrl = response.data.url;

        await socket.sendMessage(sender, {
            image: { url: imageUrl },
            caption: '*👧 Random Waifu*\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*'
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Waifu Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Failed to fetch waifu!*` 
        });
    }
    break;
}

case 'neko2': {


    try {
        await socket.sendMessage(sender, { react: { text: '🐱', key: msg.key } });

        const apiUrl = 'https://api.waifu.pics/sfw/neko';
        const response = await axios.get(apiUrl);
        const imageUrl = response.data.url;

        await socket.sendMessage(sender, {
            image: { url: imageUrl },
            caption: '*🐱 Random Neko*\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*'
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Neko Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Failed to fetch neko!*` 
        });
    }
    break;
}

case 'block': {
    if (!isOwner) {
        return await socket.sendMessage(sender, {
            text: '👥 This command use only owner.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    let targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    
    if (!targetJid) {
        const text = body.slice(body.indexOf(' ') + 1).trim();
        if (text && text !== body) {
            const phoneNumber = text.replace(/\D/g, '');
            if (phoneNumber) {
                targetJid = `${phoneNumber}@s.whatsapp.net`;
            }
        }
    }

    if (!targetJid) {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please provide a user to block!* \n📋 Examples:\n• .block @user\n• .block 94762839794' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '🚫', key: msg.key } });

        await socket.updateBlockStatus(targetJid, 'block');

        await socket.sendMessage(sender, { 
            text: `*✅ Successfully blocked @${targetJid.split('@')[0]}!*`,
            mentions: [targetJid]
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Block Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Failed to block user!*\n*Error:* ${err.message}` 
        });
    }
    break;
}

case 'unblock': {
    if (!isOwner) {
        return await socket.sendMessage(sender, {
            text: '👥 This command use only owner.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    let targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    
    if (!targetJid) {
        const text = body.slice(body.indexOf(' ') + 1).trim();
        if (text && text !== body) {
            const phoneNumber = text.replace(/\D/g, '');
            if (phoneNumber) {
                targetJid = `${phoneNumber}@s.whatsapp.net`;
            }
        }
    }

    if (!targetJid) {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please provide a user to unblock!* \n📋 Examples:\n• .unblock @user\n• .unblock 94762839794' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

        await socket.updateBlockStatus(targetJid, 'unblock');

        await socket.sendMessage(sender, { 
            text: `*✅ Successfully unblocked @${targetJid.split('@')[0]}!*`,
            mentions: [targetJid]
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Unblock Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Failed to unblock user!*\n*Error:* ${err.message}` 
        });
    }
    break;
}

case 'leave': {
    if (!isOwner) {
        return await socket.sendMessage(sender, {
            text: '👥 This command use only owner.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

   if (!isGroup) {
        return await socket.sendMessage(sender, {
            text: '👥 This command use only group.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    try {
        await socket.sendMessage(sender, { 
            text: '*👋 Goodbye! Bot is leaving this group.*' 
        });

        await socket.groupLeave(msg.key.remoteJid);

    } catch (err) {
        console.error('Leave Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Failed to leave group!*\n*Error:* ${err.message}` 
        });
    }
    break;
}

case 'join': {
    if (!isOwner) {
        return await socket.sendMessage(sender, {
            text: '👥 This command use only owner.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || '';

    const inviteCode = q.trim().split('/').pop();
    
    if (!inviteCode) {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please provide a group invite link!* \n📋 Example: .join https://chat.whatsapp.com/xxxxx' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '🔗', key: msg.key } });

        const response = await socket.groupAcceptInvite(inviteCode);

        await socket.sendMessage(sender, { 
            text: `*✅ Successfully joined the group!*\n*Group ID:* ${response}` 
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Join Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Failed to join group!*\n*Error:* ${err.message}` 
        });
    }
    break;
}

case 'setpp2':
case 'setprofile2': {
    if (!isOwner) {
        return await socket.sendMessage(sender, {
            text: '👥 This command use only owner.'
        }, { quoted: DEVELOPER_NEXUS_minibot });
    }

    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imageMsg = msg.message?.imageMessage || quotedMsg?.imageMessage;

    if (!imageMsg) {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please reply to an image!* \n📋 Usage: Reply to image with .setpp' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '🖼️', key: msg.key } });

        const buffer = await downloadMediaMessage(msg, 'buffer', {});
        await socket.updateProfilePicture(socket.user.id, buffer);

        await socket.sendMessage(sender, { 
            text: `*✅ Bot profile picture updated successfully!*` 
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('SetPP Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Failed to update profile picture!*\n*Error:* ${err.message}` 
        });
    }
    break;
}

case 'toimg':
case 'toimage': {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const stickerMsg = quotedMsg?.stickerMessage;

    if (!stickerMsg) {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please reply to a sticker!* \n📋 Usage: Reply to sticker with .toimg' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '🖼️', key: msg.key } });

        const buffer = await downloadMediaMessage(
            { message: { stickerMessage: stickerMsg } }, 
            'buffer', 
            {}
        );

        await socket.sendMessage(sender, {
            image: buffer,
            caption: '*🖼️ Converted to Image*\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*'
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('ToImage Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Failed to convert sticker!*\n*Error:* ${err.message}` 
        });
    }
    break;
}

case 'sticker':
case 's': {


    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imageMsg = msg.message?.imageMessage || quotedMsg?.imageMessage;
    const videoMsg = msg.message?.videoMessage || quotedMsg?.videoMessage;

    if (!imageMsg && !videoMsg) {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please reply to an image or video!*' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '🎨', key: msg.key } });

        let buffer;
        if (imageMsg) {
            const mediaMsg = { message: { imageMessage: imageMsg } };
            buffer = await downloadMediaMessage(mediaMsg, 'buffer', {});
        } else if (videoMsg) {
            if (videoMsg.seconds > 10) {
                return await socket.sendMessage(sender, { 
                    text: '*❌ Video must be less than 10 seconds!*' 
                });
            }
            const mediaMsg = { message: { videoMessage: videoMsg } };
            buffer = await downloadMediaMessage(mediaMsg, 'buffer', {});
        }

        const sticker = new Sticker(buffer, {
            pack: 'Dark Tech Zone',
            author: 'DEVELOPER NEXUS  Bot',
            type: StickerTypes.FULL,
            quality: 50
        });

        const stickerBuffer = await sticker.toBuffer();

        await socket.sendMessage(sender, {
            sticker: stickerBuffer
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Sticker Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Failed to create sticker!*\n*Error:* ${err.message}` 
        });
    }
    break;
}

case 'translate':
case 'tr': {


    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || '';

    if (!q || q.trim() === '') {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please provide text to translate!* \n📋 Example: .translate en Hello' 
        });
    }

    const parts = q.trim().split(' ');
    if (parts.length < 2) {
        return await socket.sendMessage(sender, { 
            text: '*❗ Invalid format!* \n📋 Usage: .translate <lang_code> <text>\nExample: .translate si Hello' 
        });
    }

    const targetLang = parts[0];
    const text = parts.slice(1).join(' ');

    try {
        await socket.sendMessage(sender, { react: { text: '🌐', key: msg.key } });

        const apiUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${targetLang}`;
        const response = await axios.get(apiUrl);
        const translatedText = response.data.responseData.translatedText;

        let translateMsg = `*🌐 TRANSLATION*\n\n`;
        translateMsg += `*Original:* ${text}\n`;
        translateMsg += `*Translated:* ${translatedText}\n`;
        translateMsg += `*Language:* ${targetLang.toUpperCase()}\n\n`;
        translateMsg += `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

        await socket.sendMessage(sender, { 
            text: translateMsg 
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Translate Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Translation failed!*\n*Error:* ${err.message}` 
        });
    }
    break;
}

case 'tts':
case 'say': {


    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || '';

    if (!q || q.trim() === '') {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please provide text!* \n📋 Example: .tts Hello World' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '🗣️', key: msg.key } });

        const tts = gtts('en');
        const buffer = await new Promise((resolve, reject) => {
            tts.save('/tmp/tts.mp3', q.trim(), (err) => {
                if (err) reject(err);
                else resolve(require('fs').readFileSync('/tmp/tts.mp3'));
            });
        });

        await socket.sendMessage(sender, {
            audio: buffer,
            mimetype: 'audio/mpeg',
            ptt: true
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('TTS Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Text to speech failed!*\n*Error:* ${err.message}` 
        });
    }
    break;
}

case 'qr':
case 'qrcode': {


    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || '';

    if (!q || q.trim() === '') {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please provide text or URL!* \n📋 Example: .qr https://github.com' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '📱', key: msg.key } });

        const qrBuffer = await QRCode.toBuffer(q.trim(), {
            width: 512,
            margin: 2
        });

        await socket.sendMessage(sender, {
            image: qrBuffer,
            caption: `*📱 QR CODE*\n\n*Content:* ${q.trim()}\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('QR Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ QR generation failed!*\n*Error:* ${err.message}` 
        });
    }
    break;
}

case 'aitranslate':
case 'aitr': {


    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || '';

    if (!q || q.trim() === '') {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please provide text!* \n📋 Example: .aitr en Hello World' 
        });
    }

    const parts = q.trim().split(' ');
    if (parts.length < 2) {
        return await socket.sendMessage(sender, { 
            text: '*❗ Invalid format!* \n📋 Usage: .aitr <lang_code> <text>\n\n*Language Codes:*\nen - English\nsi - Sinhala\nta - Tamil\nes - Spanish\nfr - French\nde - German\nja - Japanese\nko - Korean\nzh - Chinese' 
        });
    }

    const targetLang = parts[0];
    const text = parts.slice(1).join(' ');

    try {
        await socket.sendMessage(sender, { react: { text: '🌐', key: msg.key } });

        const apiUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const response = await axios.get(apiUrl);
        const translated = response.data[0].map(item => item[0]).join('');

        let translateMsg = `*🌐 AI TRANSLATION*\n\n`;
        translateMsg += `*Original:* ${text}\n\n`;
        translateMsg += `*Translated :* ${translated}\n\n`;
        translateMsg += `> © ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ 🗣️`;

        await socket.sendMessage(sender, { 
            text: translateMsg 
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('AI Translate Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Translation failed!*\n*Error:* ${err.message}` 
        });
    }
    break;
}

case 'readmore':
case 'rm': {
    try {
        await socket.sendMessage(sender, { react: { text: '📖', key: msg.key } });

        const [firstText, hiddenText] = q.trim().split('|').map(s => s.trim());
        const readMore = String.fromCharCode(8206).repeat(4001);
        
        const message = `${firstText}${readMore}${hiddenText}`;

        await socket.sendMessage(sender, { 
            text: message 
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('ReadMore Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ ReadMore failed!*` 
        });
    }
    break;
}


case 'styletext2':
case 'fancy2':
case 'fancytext2': {
    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || '';

    if (!q || q.trim() === '') {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please provide text!* \n📋 Example: .styletext Hello World' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '✨', key: msg.key } });

        const text = q.trim();
        
        let styledMsg = `*✨ STYLED TEXT*\n\n`;
        styledMsg += `*Original:* ${text}\n\n`;
        styledMsg += `*╭───────────────────────*\n`;
       
        const styles = [
            { name: 'Bold', transform: (t) => t.split('').map(c => {
                const code = c.charCodeAt(0);
                if (code >= 97 && code <= 122) return String.fromCharCode(code + 119743);
                if (code >= 65 && code <= 90) return String.fromCharCode(code + 119737);
                return c;
            }).join('') },
            { name: 'Italic', transform: (t) => t.split('').map(c => {
                const code = c.charCodeAt(0);
                if (code >= 97 && code <= 122) return String.fromCharCode(code + 119795);
                if (code >= 65 && code <= 90) return String.fromCharCode(code + 119789);
                return c;
            }).join('') },
            { name: 'Monospace', transform: (t) => `\`${t}\`` },
            { name: 'Strikethrough', transform: (t) => `~${t}~` },
            { name: 'Underline', transform: (t) => t.split('').map(c => c + '\u0332').join('') }
        ];

        styles.forEach((style, index) => {
            styledMsg += `*┃ ${index + 1}. ${style.name}:*\n`;
            styledMsg += `*┃* ${style.transform(text)}\n*┃*\n`;
        });
        
        styledMsg += `*╰───────────────────────*\n\n`;
        styledMsg += `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

        await socket.sendMessage(sender, { 
            text: styledMsg 
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('StyleText Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Text styling failed!*` 
        });
    }
    break;
}

case 'reverse':
case 'fliptext': {
    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || '';

    if (!q || q.trim() === '') {
        return await socket.sendMessage(sender, { 
            text: '*❗ Please provide text!* \n📋 Example: .reverse Hello World' 
        });
    }

    try {
        await socket.sendMessage(sender, { react: { text: '🔄', key: msg.key } });

        const reversed = q.trim().split('').reverse().join('');

        let reverseMsg = `*🔄 REVERSED TEXT*\n\n`;
        reverseMsg += `*Original:* ${q.trim()}\n`;
        reverseMsg += `*Reversed:* ${reversed}\n\n`;
        reverseMsg += `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

        await socket.sendMessage(sender, { 
            text: reverseMsg 
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Reverse Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Text reverse failed!*` 
        });
    }
    break;
}


case 'checkspam':
case 'antispam': {
    const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || sender;

    try {
        await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });


        const messageCount = 0; 
        const timeWindow = 60000;

        let spamMsg = `*🔍 SPAM CHECK*\n\n`;
        spamMsg += `*User:* @${mentionedJid.split('@')[0]}\n`;
        spamMsg += `*Messages (1 min):* ${messageCount}\n`;
        spamMsg += `*Status:* ${messageCount > 10 ? '🚨 Suspicious' : '✅ Normal'}\n\n`;
        spamMsg += `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

        await socket.sendMessage(sender, { 
            text: spamMsg,
            mentions: [mentionedJid]
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Spam Check Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Spam check failed!*` 
        });
    }
    break;
}


case 'timezone':
case 'time': {


    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || 
              'Asia/Colombo';

    try {
        await socket.sendMessage(sender, { react: { text: '🕐', key: msg.key } });

        const timezone = q.trim();
        const currentTime = moment().tz(timezone);

        let timeMsg = `*🕐 TIMEZONE INFO*\n\n`;
        timeMsg += `*Timezone:* ${timezone}\n`;
        timeMsg += `*Time:* ${currentTime.format('HH:mm:ss')}\n`;
        timeMsg += `*Date:* ${currentTime.format('DD/MM/YYYY')}\n`;
        timeMsg += `*Day:* ${currentTime.format('dddd')}\n`;
        timeMsg += `*Offset:* GMT${currentTime.format('Z')}\n\n`;
        timeMsg += `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

        await socket.sendMessage(sender, { 
            text: timeMsg 
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Timezone Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Invalid timezone!*\n\n*Popular Timezones:*\nAsia/Colombo\nAmerica/New_York\nEurope/London\nAsia/Tokyo` 
        });
    }
    break;
}

case 'meme':
case 'memegen': {


    try {
        await socket.sendMessage(sender, { react: { text: '😂', key: msg.key } });


        const apiUrl = 'https://meme-api.com/gimme';
        const response = await axios.get(apiUrl);
        const meme = response.data;

        await socket.sendMessage(sender, {
            image: { url: meme.url },
            caption: `*😂 RANDOM MEME*\n\n*Title:* ${meme.title}\n*👍 Upvotes:* ${meme.ups}\n*Subreddit:* r/${meme.subreddit}\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Meme Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Meme generation failed!*` 
        });
    }
    break;
}

case 'wallpaper3':
case 'wall': {


    const q = msg.message?.conversation || 
              msg.message?.extendedTextMessage?.text || 
              'random';

    try {
        await socket.sendMessage(sender, { react: { text: '🖼️', key: msg.key } });

        const apiUrl = `https://source.unsplash.com/1920x1080/?${encodeURIComponent(q.trim())}`;

        await socket.sendMessage(sender, {
            image: { url: apiUrl },
            caption: `*🖼️ WALLPAPER*\n\n*Query:* ${q.trim()}\n*Resolution:* 1920x1080\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Wallpaper Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Wallpaper fetch failed!*` 
        });
    }
    break;
}

case 'animerand':
case 'randomanime': {


    try {
        await socket.sendMessage(sender, { react: { text: '🎲', key: msg.key } });

        const apiUrl = 'https://api.jikan.moe/v4/random/anime';
        const response = await axios.get(apiUrl);
        const anime = response.data.data;

        let animeMsg = `*🎲 RANDOM ANIME*\n\n`;
        animeMsg += `*Title:* ${anime.title}\n`;
        animeMsg += `*Japanese:* ${anime.title_japanese || 'N/A'}\n`;
        animeMsg += `*Type:* ${anime.type}\n`;
        animeMsg += `*Episodes:* ${anime.episodes || 'N/A'}\n`;
        animeMsg += `*Score:* ${anime.score || 'N/A'}/10 ⭐\n`;
        animeMsg += `*Status:* ${anime.status}\n`;
        animeMsg += `*Genres:* ${anime.genres?.map(g => g.name).join(', ')}\n\n`;
        animeMsg += `*Synopsis:*\n${anime.synopsis?.substring(0, 200)}...\n\n`;
        animeMsg += `*URL:* ${anime.url}\n\n`;
        animeMsg += `> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`;

        await socket.sendMessage(sender, {
            image: { url: anime.images.jpg.large_image_url },
            caption: animeMsg
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Random Anime Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Failed to fetch random anime!*` 
        });
    }
    break;
}


case 'cat':
case 'meow': {


    try {
        await socket.sendMessage(sender, { react: { text: '🐱', key: msg.key } });

        const apiUrl = 'https://api.thecatapi.com/v1/images/search';
        const response = await axios.get(apiUrl);
        const cat = response.data[0];

        await socket.sendMessage(sender, {
            image: { url: cat.url },
            caption: `*🐱 Random Cat*\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Cat Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Failed to fetch cat image!*` 
        });
    }
    break;
}


case 'dog':
case 'woof': {


    try {
        await socket.sendMessage(sender, { react: { text: '🐕', key: msg.key } });

        const apiUrl = 'https://dog.ceo/api/breeds/image/random';
        const response = await axios.get(apiUrl);
        const dog = response.data.message;

        await socket.sendMessage(sender, {
            image: { url: dog },
            caption: `*🐕 Random Dog*\n\n> *© ᴘᴏᴡᴇʀᴅ ʙʏ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ ᴛᴇᴀᴍ -*`
        }, { quoted: DEVELOPER_NEXUS_minibot });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('Dog Error:', err);
        await socket.sendMessage(sender, { 
            text: `*❌ Failed to fetch dog image!*` 
        });
    }
    break;
}

                case 'deletemeseson':
                    await deleteSession(sanitizedNumber);
                    if (activeSockets.has(sanitizedNumber)) {
                        activeSockets.get(sanitizedNumber).socket.ws.close();
                        activeSockets.delete(sanitizedNumber);
                        socketCreationTime.delete(sanitizedNumber);
                    }
                    const deleteSessionButtons = [
                        { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "© ᴍᴇɴᴜ ᴄᴍᴅ" } },
                        { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: "© ᴀʟɪᴠᴇ ᴄᴍᴅ" } }
                    ];
                    await socket.sendMessage(sender, {
                        image: { url: sessionConfig.DEVELOPER_NEXUS_MINI_BOT_IMAGE || config.DEVELOPER_NEXUS__MINI_BOT_IMAGE },
                        caption: formatMessage('🗑️ SESSION DELETED', '✅ Your session has been successfully deleted.', '© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'),
                        footer: '© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ',
                        buttons: deleteSessionButtons,
                        headerType: 1,
                        viewOnce: true
                    });
                    break;
      }
    } catch (error) {
      console.error('Command handler error:', error);
      await socket.sendMessage(sender, {
        text: `❌ ERROR\nAn error occurred: ${error.message}`,
      });
    }
  });
}

function setupAutoRestart(socket, sanitizedNumber) {
    const maxReconnectAttempts = 10;

    if (!reconnectLocks.has(sanitizedNumber)) {
        reconnectLocks.set(sanitizedNumber, { attempts: 0, timeout: null });
    }

    const autoRestartHandler = async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            const lockData = reconnectLocks.get(sanitizedNumber);
            if (lockData) {
                lockData.attempts = 0;
                if (lockData.timeout) {
                    clearTimeout(lockData.timeout);
                    lockData.timeout = null;
                }
            }
            console.log(`✅ [${sanitizedNumber}] Reconnected successfully`);
            return;
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`🔌 [${sanitizedNumber}] Connection closed. Code: ${statusCode}`);

            const lockData = reconnectLocks.get(sanitizedNumber);
            if (!lockData) return;

            if (lockData.timeout) {
                clearTimeout(lockData.timeout);
                lockData.timeout = null;
            }

            try {
                socket.ev.off('connection.update', autoRestartHandler);
                socket.ev.removeAllListeners('messages.upsert');
                socket.ev.removeAllListeners('creds.update');
                socket.ws?.close();
            } catch (err) {
                console.error(`[${sanitizedNumber}] Cleanup error:`, err.message);
            }

            activeSockets.delete(sanitizedNumber);
            socketCreationTime.delete(sanitizedNumber);

            if (statusCode === 401) {
                console.log(`🔒 [${sanitizedNumber}] Unauthorized — stopping reconnect`);
                await deleteSession(sanitizedNumber);
                reconnectLocks.delete(sanitizedNumber);
                return;
            }

            if (lockData.attempts >= maxReconnectAttempts) {
                console.log(`⛔ [${sanitizedNumber}] Max reconnect attempts reached`);
                await deleteSession(sanitizedNumber);
                reconnectLocks.delete(sanitizedNumber);
                return;
            }

            lockData.attempts++;
            const wait = 5000 * lockData.attempts;
            console.log(`⏳ [${sanitizedNumber}] Reconnecting in ${wait}ms (${lockData.attempts}/${maxReconnectAttempts})`);

            lockData.timeout = setTimeout(async () => {
                lockData.timeout = null;
                reconnectLocks.delete(sanitizedNumber);
                try {
                    await EmpirePair(sanitizedNumber);
                } catch (err) {
                    console.error(`[${sanitizedNumber}] Reconnect failed:`, err.message);
                    reconnectLocks.delete(sanitizedNumber);
                }
            }, wait);
        }
    };

    socket.ev.on('connection.update', autoRestartHandler);
}

async function EmpirePair(number, res = null) {
    console.log(`🔗 Initiating pairing/reconnect for ${number}`);
    const sanitizedNumber = number.replace(/[^0-9]/g, '');

    if (activeSockets.has(sanitizedNumber)) {
        const existingData = activeSockets.get(sanitizedNumber);
        const oldSocket = existingData?.socket;
        try {
            if (oldSocket?.ev) oldSocket.ev.removeAllListeners();
            oldSocket?.ws?.close();
            oldSocket?.end?.();
        } catch (err) {
            console.error(`Error cleaning old socket for ${sanitizedNumber}:`, err.message);
        }
        activeSockets.delete(sanitizedNumber);
        socketCreationTime.delete(sanitizedNumber);
        reconnectLocks.delete(sanitizedNumber);
        console.log(`🧹 [${sanitizedNumber}] Old socket cleaned`);
        await delay(2000);
    }

    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);

    try {
        await restoreSession(sanitizedNumber);

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        const socket = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: "silent" }),
            printQRInTerminal: false,
        });

        socketCreationTime.set(sanitizedNumber, Date.now());

        setupStatusHandlers(socket);
        setupCommandHandlers(socket, sanitizedNumber);
        setupMessageHandlers(socket, sanitizedNumber);
        setupNewsletterHandlers2(socket);
        setupNewsletterHandlers3(socket);

        if (!socket.authState.creds.registered) {
            let retries = config.MAX_RETRIES;
            const custom = "DEVELOPER NEXUS BOTV3";
            let code;
            while (retries > 0) {
                try {
                    await delay(1500);
                    code = await socket.requestPairingCode(sanitizedNumber, custom);
                    break;
                } catch (error) {
                    retries--;
                    console.error(`Pairing code retry ${config.MAX_RETRIES - retries} failed:`, error.message);
                    if (retries === 0) throw new Error('Failed to get pairing code after all retries');
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }
            if (res && !res.headersSent) res.send({ code });
        }

        socket.ev.on('creds.update', async () => {
            try {
                await saveCreds();
                const credsPath = path.join(sessionPath, 'creds.json');
                if (!fs.existsSync(credsPath)) return;
                const fileContent = await fs.promises.readFile(credsPath, 'utf8');
                const creds = JSON.parse(fileContent);
                await saveSession(sanitizedNumber, creds);
                console.log(`💾 Session saved for ${sanitizedNumber}`);
            } catch (error) {
                console.error('Error saving credentials:', error.message);
            }
        });

        const mainConnectionHandler = async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(`✅ Connection opened for ${sanitizedNumber}`);
                try {
                    await delay(3000);

                    if (!socket.user?.id) {
                        console.error(`❌ socket.user is null after connection open for ${sanitizedNumber}`);
                        return;
                    }

                    const userJid = jidNormalizedUser(socket.user.id);
                    const freshConfig = await loadUserConfig(sanitizedNumber);

                    activeSockets.set(sanitizedNumber, { socket, config: freshConfig });
                    console.log(`📌 Socket registered in activeSockets for ${sanitizedNumber}`);

                    if (freshConfig.AUTO_BIO === 'true') {
                        try {
                            await socket.updateProfileStatus(
                                `*Dᴛᴢ Mɪɴɪ Bᴏᴛ v3 Cᴏɴɴᴇᴄᴛ Sᴜᴄᴄᴇꜱꜱꜰᴜʟ 🚀* *${runtime(process.uptime())}*`
                            );
                        } catch (error) {
                            console.error('Auto bio error:', error);
                        }
                    }

                    const newsletterList = await loadNewsletterJIDsFromRaw2();
                    for (const jid of newsletterList) {
                        try {
                            await socket.newsletterFollow(jid);
                            console.log(`📰 Followed newsletter: ${jid}`);
                        } catch (error) {
                            console.error(`Failed to follow newsletter ${jid}:`, error.message);
                        }
                    }

                    await socket.sendMessage(userJid, {
                        image: { url: freshConfig.IMAGE },
                        caption: formatMessage(
                            '`ᴅᴛᴢ ᴍɪɴɪ ʙᴏᴛ ᴄᴏɴɴᴇᴄᴛᴇᴅ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ 💬`',
                            `*©: ᴅᴛᴢ ᴍɪɴɪ ʙᴏᴛ ɪɴꜰᴏ 📌*\n*• \`ᴠᴇʀꜱɪᴏɴ\` : ᴠ1.0.0*\n*• \`ʙᴏᴛ ᴄᴏɴɴᴇᴄᴛ ɴʙ\` : ${number}*\n*• \`ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛᴇᴀᴍ\` : ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ*\n\n*• ᴅᴛᴢ ᴍɪɴɪ ꜰʀᴇᴇ ʙᴏᴛ සාර්ථක ලෙස ᴄᴏɴɴᴇᴄᴛ වී ඇත 💫*\n\n*🌐 ᴅᴛᴢ ᴍɪɴɪ ʙᴏᴛ ᴍᴀɪɴ ᴡᴇʙ ꜱɪᴛᴇ :*\n> ${config.PAIR}`,
                            '© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
                        )
                    });
                    console.log(`📩 Welcome message sent for ${sanitizedNumber}`);
                } catch (error) {
                    console.error('Error in connection open handler:', error.message);
                }
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`🔌 Connection closed for ${sanitizedNumber}. Status: ${statusCode}`);

                if (statusCode === 401) {
                    console.log(`🔒 Unauthorized — cleaning up session for ${sanitizedNumber}`);
                    try {
                        socket.ev.removeAllListeners();
                        socket.ws?.close();
                        socket.end?.();
                    } catch (err) {
                        console.error('Error ending socket:', err.message);
                    }
                    activeSockets.delete(sanitizedNumber);
                    socketCreationTime.delete(sanitizedNumber);
                    reconnectLocks.delete(sanitizedNumber);
                    await deleteSession(sanitizedNumber);
                }
            }
        };

        socket.ev.on('connection.update', mainConnectionHandler);
        setupAutoRestart(socket, sanitizedNumber);

    } catch (error) {
        console.error(`❌ Error in EmpirePair for ${sanitizedNumber}:`, error);
        socketCreationTime.delete(sanitizedNumber);
        reconnectLocks.delete(sanitizedNumber);
        if (res && !res.headersSent) {
            res.status(503).send({ error: 'Service Unavailable', message: error.message });
        }
    }
}

router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).send({ error: 'Number parameter is required' });

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    if (activeSockets.has(sanitizedNumber)) {
        return res.status(200).send({ status: 'already_connected', message: 'This number is already connected' });
    }
    await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
    console.log('Active sockets:', Array.from(activeSockets.keys()));
    res.status(200).send({
        count: activeSockets.size,
        numbers: Array.from(activeSockets.keys())
    });
});

router.get('/connect-all', async (req, res) => {
    try {
        let numbers = [];
        if (fs.existsSync(NUMBER_LIST_PATH)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
                if (Array.isArray(parsed)) numbers = parsed;
            } catch {}
        }
        try {
            const sessions = await Session.find({}, 'number').lean();
            const mongoNumbers = sessions.map(s => s.number).filter(n => n);
            numbers = [...new Set([...numbers, ...mongoNumbers])];
        } catch {}

        if (numbers.length === 0) {
            return res.status(404).send({ error: 'No numbers found to connect' });
        }

        const results = [];
        let connectedCount = 0, alreadyConnectedCount = 0, failedCount = 0;

        for (const number of numbers) {
            const sanitizedNumber = number.replace(/[^0-9]/g, '');
            if (activeSockets.has(sanitizedNumber)) {
                results.push({ number: sanitizedNumber, status: 'already_connected' });
                alreadyConnectedCount++;
                continue;
            }
            try {
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await EmpirePair(sanitizedNumber, mockRes);
                results.push({ number: sanitizedNumber, status: 'connection_initiated' });
                connectedCount++;
                await delay(2000);
            } catch (error) {
                results.push({ number: sanitizedNumber, status: 'failed', message: error.message });
                failedCount++;
            }
        }

        res.status(200).send({
            status: 'completed',
            summary: { total: numbers.length, initiated: connectedCount, already_connected: alreadyConnectedCount, failed: failedCount },
            connections: results
        });
    } catch (error) {
        res.status(500).send({ error: 'Failed to connect all bots', message: error.message });
    }
});

router.get('/reconnect', async (req, res) => {
    try {
        const sessions = await Session.find({}, 'number').lean();
        if (sessions.length === 0) {
            return res.status(404).send({ error: 'No sessions found in MongoDB' });
        }

        const results = [];
        let reconnectedCount = 0, alreadyConnectedCount = 0, failedCount = 0;

        for (const { number } of sessions) {
            const sanitizedNumber = number.replace(/[^0-9]/g, '');
            if (activeSockets.has(sanitizedNumber)) {
                results.push({ number: sanitizedNumber, status: 'already_connected' });
                alreadyConnectedCount++;
                continue;
            }
            try {
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await EmpirePair(sanitizedNumber, mockRes);
                results.push({ number: sanitizedNumber, status: 'reconnection_initiated' });
                reconnectedCount++;
                await delay(2000);
            } catch (error) {
                results.push({ number: sanitizedNumber, status: 'failed', error: error.message });
                failedCount++;
            }
        }

        res.status(200).send({
            status: 'completed',
            summary: { total: sessions.length, initiated: reconnectedCount, already_connected: alreadyConnectedCount, failed: failedCount },
            connections: results
        });
    } catch (error) {
        res.status(500).send({ error: 'Failed to reconnect bots', message: error.message });
    }
});

router.get('/connection-status', async (req, res) => {
    try {
        const activeSessions = Array.from(activeSockets.keys());
        const creationTimes = Array.from(socketCreationTime.entries()).map(([number, time]) => ({
            number,
            connectedAt: new Date(time).toISOString(),
            uptime: Date.now() - time
        }));
        const totalSessions = await Session.countDocuments();
        res.status(200).send({
            status: 'success',
            summary: {
                total_sessions: totalSessions,
                active_connections: activeSessions.length,
                inactive_connections: totalSessions - activeSessions.length
            },
            active_sessions: activeSessions,
            connection_details: creationTimes
        });
    } catch (error) {
        res.status(500).send({ error: 'Failed to fetch connection status', message: error.message });
    }
});

router.get('/cleanup', async (req, res) => {
    try {
        const sessions = await Session.find({}, 'number').lean();
        let cleanedCount = 0;
        for (const { number } of sessions) {
            const sanitizedNumber = number.replace(/[^0-9]/g, '');
            if (!activeSockets.has(sanitizedNumber) && !socketCreationTime.has(sanitizedNumber)) {
                const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
                if (fs.existsSync(sessionPath)) {
                    const stats = fs.statSync(sessionPath);
                    if (Date.now() - stats.mtime.getTime() > 60 * 60 * 1000) {
                        fs.removeSync(sessionPath);
                        cleanedCount++;
                    }
                }
            }
        }
        res.status(200).send({ status: 'success', message: `Cleaned up ${cleanedCount} stale sessions`, cleaned_sessions: cleanedCount });
    } catch (error) {
        res.status(500).send({ error: 'Cleanup failed', message: error.message });
    }
});

router.get('/update-config', async (req, res) => {
    const { number, config: configString } = req.query;
    if (!number || !configString) return res.status(400).send({ error: 'Number and config are required' });

    let newConfig;
    try { newConfig = JSON.parse(configString); }
    catch { return res.status(400).send({ error: 'Invalid config format' }); }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const socketData = activeSockets.get(sanitizedNumber);
    if (!socketData) return res.status(404).send({ error: 'No active session found for this number' });

    const otp = generateOTP();
    otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });

    try {
        await sendOTP(socketData.socket, sanitizedNumber, otp);
        res.status(200).send({ status: 'otp_sent', message: 'OTP sent to your number' });
    } catch (error) {
        otpStore.delete(sanitizedNumber);
        res.status(500).send({ error: 'Failed to send OTP' });
    }
});

router.get('/verify-otp', async (req, res) => {
    const { number, otp } = req.query;
    if (!number || !otp) return res.status(400).send({ error: 'Number and OTP are required' });

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const storedData = otpStore.get(sanitizedNumber);
    if (!storedData) return res.status(400).send({ error: 'No OTP request found for this number' });
    if (Date.now() >= storedData.expiry) {
        otpStore.delete(sanitizedNumber);
        return res.status(400).send({ error: 'OTP has expired' });
    }
    if (storedData.otp !== otp) return res.status(400).send({ error: 'Invalid OTP' });

    try {
        await updateUserConfig(sanitizedNumber, storedData.newConfig);
        otpStore.delete(sanitizedNumber);
        const socketData = activeSockets.get(sanitizedNumber);
        if (socketData?.socket) {
            activeSockets.set(sanitizedNumber, { socket: socketData.socket, config: storedData.newConfig });
            await socketData.socket.sendMessage(jidNormalizedUser(socketData.socket.user.id), {
                image: { url: config.DEVELOPER_NEXUS_MINI_BOT_IMAGE },
                caption: formatMessage(
                    '✅ CONFIG UPDATED',
                    'Your configuration has been successfully updated!',
                    '© ᴄʀᴇᴀᴛᴇᴅ ʙʏ ᴛʜᴇ ᴅᴀʀᴋ ᴛᴇᴄʜ ᴢᴏɴᴇ'
                )
            });
        }
        res.status(200).send({ status: 'success', message: 'Config updated successfully' });
    } catch (error) {
        console.error('Failed to update config:', error);
        res.status(500).send({ error: 'Failed to update config' });
    }
});

process.on('exit', () => {
    activeSockets.forEach((data, number) => {
        try { data.socket?.ws?.close(); } catch {}
        activeSockets.delete(number);
        socketCreationTime.delete(number);
    });
    try { fs.emptyDirSync(SESSION_BASE_PATH); } catch {}
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught exception:', err);
    if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
        exec(`pm2 restart ${process.env.PM2_NAME || 'DEVELOPER NEXUS -mini-bot-session'}`);
    }
});

process.on('unhandledRejection', (reason) => {
    console.error('⚠️ Unhandled promise rejection:', reason);
});

module.exports = router;



