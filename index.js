const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const pino = require('pino')
const qrcode = require('qrcode-terminal')
const cron = require('node-cron')
const fs = require('fs')

// Load config files
const loadGroups = () => {
  if (fs.existsSync('./groups.json')) {
    return JSON.parse(fs.readFileSync('./groups.json'))
  }
  return { groups: [] }
}

const loadMessages = () => {
  if (fs.existsSync('./messages.json')) {
    return JSON.parse(fs.readFileSync('./messages.json'))
  }
  return { broadcasts: [], autoreplies: [] }
}

// Auto reply handler
const handleAutoReply = async (sock, message) => {
  const messages = loadMessages()
  const from = message.key.remoteJid
  const isGroup = from.endsWith('@g.us')
  
  // Only auto-reply to private messages not groups
  if (isGroup) return
  
  const text = message.message?.conversation || 
               message.message?.extendedTextMessage?.text || ''
  
  const lowerText = text.toLowerCase()
  
  for (const reply of messages.autoreplies) {
    const keywordMatch = reply.keywords.some(k => lowerText.includes(k.toLowerCase()))
    if (keywordMatch) {
      await sock.sendMessage(from, { 
        text: reply.response 
      })
      console.log(`Auto-replied to ${from}`)
      return
    }
  }
  
  // Default reply if no keyword matched
const defaultReply = `👋 *Welcome to Confluence Projects Consult!*
_From Proposal to Defence... and Beyond_

Thank you for reaching out. 🎓

We help undergraduate and postgraduate students across Nigeria deliver quality academic projects in Management and Social Sciences — professionally and confidentially.

Please tell us:
1️⃣ Your institution
2️⃣ Your department
3️⃣ Your level (HND / BSc / MSc / PhD)
4️⃣ What you need help with
5️⃣ Your deadline (if any)

👤 *Mr. Oladimeji will attend to you shortly!* 🙏`

  await sock.sendMessage(from, { text: defaultReply })
}

// Broadcast to groups
const broadcastToGroups = async (sock, messageText, targetGroups) => {
  const { groups } = loadGroups()
  
  const selected = groups.filter(g => 
    g.active && (targetGroups.includes('all') || targetGroups.includes(g.name))
  )
  
  console.log(`Broadcasting to ${selected.length} groups...`)
  
  for (const group of selected) {
    try {
      await sock.sendMessage(group.id, { text: messageText })
      console.log(`✅ Sent to ${group.name}`)
      // Delay between messages to avoid spam detection
      await new Promise(r => setTimeout(r, 3000))
    } catch (err) {
      console.log(`❌ Failed to send to ${group.name}:`, err.message)
    }
  }
}

// Schedule broadcasts
const setupSchedules = (sock) => {
  const messages = loadMessages()
  
  messages.broadcasts.forEach(broadcast => {
    if (!broadcast.active) return
    
    cron.schedule(broadcast.schedule, async () => {
      console.log(`Running scheduled broadcast: ${broadcast.name}`)
      await broadcastToGroups(sock, broadcast.message, broadcast.targetGroups)
    })
    
    console.log(`✅ Scheduled: ${broadcast.name} — ${broadcast.schedule}`)
  })
}

// List all groups
const listGroups = async (sock) => {
  const chats = await sock.groupFetchAllParticipating()
  console.log('\n===== YOUR WHATSAPP GROUPS =====')
  Object.values(chats).forEach(chat => {
    console.log(`Name: ${chat.subject}`)
    console.log(`ID: ${chat.id}`)
    console.log('---')
  })
  console.log('================================\n')
  console.log('Copy the IDs above into your groups.json file')
}

// Main connection
const connectToWhatsApp = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')
  
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'silent' })
  })
  
  sock.ev.on('creds.update', saveCreds)
  
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update
    
    if (qr) {
      console.log('\n📱 Scan this QR code with your WhatsApp business
