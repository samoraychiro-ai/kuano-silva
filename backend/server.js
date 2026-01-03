const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// --- CONFIGURAÇÃO DO BANCO DE DADOS ---
const db = new sqlite3.Database('./chat.db', (err) => {
    if (err) console.error('Erro ao abrir banco:', err.message);
    console.log('📦 Conectado ao SQLite.');
});

// Criar tabelas se não existirem
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS public_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        text TEXT,
        time TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS private_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_user TEXT,
        to_user TEXT,
        text TEXT,
        time TEXT
    )`);
});

app.use(express.static(path.join(__dirname, '../frontend')));

const users = new Map();

io.on('connection', (socket) => {
    
    socket.on('join', (data) => {
        const { username } = data;
        users.set(socket.id, { id: socket.id, username, isTyping: false });

        // 1. Enviar histórico do chat público
        db.all("SELECT username as 'from', text, time FROM public_messages ORDER BY id ASC LIMIT 50", [], (err, rows) => {
            if (!err) socket.emit('history_public', rows);
        });

        updateOnlineUsers();
        socket.broadcast.emit('user_joined', { username });
        socket.emit('join_success', { username });
    });

    // Mensagem Pública
    socket.on('message_to_all', (data) => {
        const user = users.get(socket.id);
        if (!user) return;

        const time = new Date().toLocaleTimeString();
        
        // Salvar no banco
        db.run("INSERT INTO public_messages (username, text, time) VALUES (?, ?, ?)", 
            [user.username, data.text, time]);

        io.emit('new_message', { from: user.username, text: data.text, time });
    });

    // Mensagem Privada
    socket.on('private_message', (data) => {
        const fromUser = users.get(socket.id);
        if (!fromUser) return;

        const time = new Date().toLocaleTimeString();

        // Salvar no banco
        db.run("INSERT INTO private_messages (from_user, to_user, text, time) VALUES (?, ?, ?, ?)",
            [fromUser.username, data.to, data.text, time]);

        let toSocketId = [...users.entries()].find(([id, u]) => u.username === data.to)?.[0];

        const msgData = { from: fromUser.username, to: data.to, text: data.text, time };
        socket.emit('private_message_received', msgData);
        if (toSocketId) io.to(toSocketId).emit('private_message_received', msgData);
    });

    // Solicitar histórico privado entre dois usuários
    socket.on('get_private_history', (otherUser) => {
        const me = users.get(socket.id)?.username;
        db.all(`SELECT from_user as 'from', to_user as 'to', text, time 
                FROM private_messages 
                WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)
                ORDER BY id ASC`, [me, otherUser, otherUser, me], (err, rows) => {
            if (!err) socket.emit('history_private', rows);
        });
    });

    socket.on('typing', (data) => {
        const user = users.get(socket.id);
        if (user) socket.broadcast.emit('user_typing', { username: user.username, isTyping: data.isTyping });
    });

    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            users.delete(socket.id);
            updateOnlineUsers();
            io.emit('user_left', { username: user.username });
        }
    });

    function updateOnlineUsers() {
        const onlineUsers = Array.from(users.values()).map(u => ({ username: u.username, isTyping: u.isTyping }));
        io.emit('online_users_update', onlineUsers);
    }
});

server.listen(3000, () => console.log(`🚀 http://localhost:3000`));