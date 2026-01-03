class ChatApp {
    constructor() {
        this.socket = io();
        this.currentUser = null;
        this.activePrivateUser = null;
        this.typingTimeout = null;
        this.isTyping = false;
        this.init();
    }

    init() {
        // Seletores de Abas
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e));
        });

        document.getElementById('join-btn').addEventListener('click', () => this.joinChat());
        document.getElementById('send-btn').addEventListener('click', () => this.sendMessage());
        document.getElementById('send-private').addEventListener('click', () => this.sendPrivateMessage());
        document.getElementById('leave-btn').addEventListener('click', () => location.reload());
        
        document.getElementById('message-input').addEventListener('input', () => this.handleTyping());
        document.getElementById('private-message').addEventListener('input', () => this.handleTyping());

        document.getElementById('private-recipient').addEventListener('change', (e) => {
            this.activePrivateUser = e.target.value;
            const input = document.getElementById('private-message');
            const btn = document.getElementById('send-private');
            input.disabled = !this.activePrivateUser;
            btn.disabled = !this.activePrivateUser;
            
            if (this.activePrivateUser) {
                this.socket.emit('get_private_history', this.activePrivateUser);
            }
        });

        this.setupSocketListeners();
    }

    switchTab(e) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.target).classList.remove('hidden');
    }

    setupSocketListeners() {
        // Histórico Público
        this.socket.on('history_public', (messages) => {
            const div = document.getElementById('messages');
            div.innerHTML = '';
            messages.forEach(msg => this.addMessage('messages', msg, msg.from === this.currentUser));
        });

        // Histórico Privado
        this.socket.on('history_private', (messages) => {
            const div = document.getElementById('private-chat');
            div.innerHTML = '<div class="message system">Histórico carregado</div>';
            messages.forEach(msg => this.addMessage('private-chat', msg, msg.from === this.currentUser));
        });

        this.socket.on('new_message', (data) => {
            this.addMessage('messages', data, data.from === this.currentUser);
        });

        this.socket.on('private_message_received', (data) => {
            // Se for do usuário que estou vendo ou se fui eu que mandei
            if (data.from === this.activePrivateUser || data.from === this.currentUser) {
                this.addMessage('private-chat', data, data.from === this.currentUser);
            } else {
                document.getElementById('private-badge').classList.remove('hidden');
            }
        });

        this.socket.on('online_users_update', (users) => this.updateUserLists(users));
        
        this.socket.on('user_typing', (data) => {
            const indicator = document.getElementById('typing-indicator');
            const typingUser = document.getElementById('typing-user');
            
            if (data.isTyping) {
                typingUser.textContent = data.username;
                indicator.classList.remove('hidden');
            } else {
                indicator.classList.add('hidden');
            }
        });
    }

    joinChat() {
        const username = document.getElementById('username').value.trim();
        if (!username) return alert('Digite um nome');
        this.currentUser = username;
        this.socket.emit('join', { username });
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('chat-screen').classList.remove('hidden');
    }
    
    handleTyping() {
        if (!this.isTyping) {
            this.isTyping = true;
            this.socket.emit('typing', { isTyping: true });
        }
        
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            this.isTyping = false;
            this.socket.emit('typing', { isTyping: false });
        }, 2000);
    }

    sendMessage() {
        const input = document.getElementById('message-input');
        if (input.value.trim()) {
            this.socket.emit('message_to_all', { text: input.value });
            input.value = '';
            this.isTyping = false;
            this.socket.emit('typing', { isTyping: false });
            clearTimeout(this.typingTimeout);
        }
    }

    sendPrivateMessage() {
        const input = document.getElementById('private-message');
        if (input.value.trim() && this.activePrivateUser) {
            this.socket.emit('private_message', { to: this.activePrivateUser, text: input.value });
            input.value = '';
            this.isTyping = false;
            this.socket.emit('typing', { isTyping: false });
            clearTimeout(this.typingTimeout);
        }
    }

    addMessage(containerId, data, isSent) {
        const div = document.getElementById(containerId);
        const msgEl = document.createElement('div');
        msgEl.className = `message ${isSent ? 'sent' : 'received'}`;
        msgEl.innerHTML = `
            <div class="message-header">
                <span class="message-sender">${data.from}</span>
                <span class="message-time">${data.time}</span>
            </div>
            <div class="message-text">${data.text}</div>
        `;
        div.appendChild(msgEl);
        div.scrollTop = div.scrollHeight;
    }

    updateUserLists(users) {
        const list = document.getElementById('online-users');
        const select = document.getElementById('private-recipient');
        const currentSelection = select.value;

        list.innerHTML = '';
        select.innerHTML = '<option value="">Selecione um usuário...</option>';

        users.forEach(user => {
            if (user.username === this.currentUser) return;
            
            // Lista lateral
            const li = document.createElement('li');
            li.innerHTML = `<i class="fas fa-circle"></i> ${user.username}`;
            list.appendChild(li);

            // Select privado
            const opt = document.createElement('option');
            opt.value = user.username;
            opt.textContent = user.username;
            if (user.username === currentSelection) opt.selected = true;
            select.appendChild(opt);
        });
        document.getElementById('online-count').textContent = users.length - 1;
    }
    
}


document.addEventListener('DOMContentLoaded', () => new ChatApp());