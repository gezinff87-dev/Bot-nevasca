require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionFlagsBits, ChannelType, REST, Routes } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const CONFIG_FILE = path.join(__dirname, 'config.json');
let config = {};

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
            config = JSON.parse(data);
            console.log('✅ Configurações carregadas com sucesso!');
        } else {
            config = {};
            saveConfig();
            console.log('📝 Arquivo config.json criado.');
        }
    } catch (error) {
        console.error('❌ Erro ao carregar config.json:', error);
        config = {};
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 4), 'utf-8');
        console.log('💾 Configurações salvas!');
    } catch (error) {
        console.error('❌ Erro ao salvar config.json:', error);
    }
}

function sanitizeUsername(username) {
    return username
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 40);
}

const commands = [
    {
        name: 'setup',
        description: 'Configura o sistema de tickets (cargo de suporte e categoria)',
        options: [
            {
                name: 'cargo',
                description: 'Cargo que terá acesso aos tickets',
                type: 8,
                required: true
            },
            {
                name: 'categoria',
                description: 'Categoria onde os tickets serão criados',
                type: 7,
                required: true,
                channel_types: [ChannelType.GuildCategory]
            }
        ]
    },
    {
        name: 'ticket',
        description: 'Envia o painel de tickets no canal atual'
    },
    {
        name: 'adduser',
        description: 'Adiciona um usuário ao ticket atual',
        options: [
            {
                name: 'usuario',
                description: 'Usuário a ser adicionado ao ticket',
                type: 6,
                required: true
            }
        ]
    },
    {
        name: 'remove_user',
        description: 'Remove um usuário do ticket atual',
        options: [
            {
                name: 'usuario',
                description: 'Usuário a ser removido do ticket',
                type: 6,
                required: true
            }
        ]
    },
    {
        name: 'logs',
        description: 'Configura o canal de logs para tickets abertos e fechados',
        options: [
            {
                name: 'canal',
                description: 'Canal onde os logs serão enviados',
                type: 7,
                required: true,
                channel_types: [ChannelType.GuildText]
            }
        ]
    },
    {
        name: 'add_cargo',
        description: 'Adiciona um cargo de suporte ao sistema de tickets',
        options: [
            {
                name: 'cargo',
                description: 'Cargo que terá acesso aos tickets',
                type: 8,
                required: true
            }
        ]
    },
    {
        name: 'remove_cargo',
        description: 'Remove um cargo de suporte do sistema',
        options: [
            {
                name: 'cargo',
                description: 'Cargo a ser removido',
                type: 8,
                required: true
            }
        ]
    },
    {
        name: 'list_cargos',
        description: 'Lista todos os cargos de suporte configurados'
    },
    {
        name: 'add_button',
        description: 'Adiciona um botão personalizado ao painel de tickets',
        options: [
            {
                name: 'label',
                description: 'Texto que aparece no botão',
                type: 3,
                required: true
            },
            {
                name: 'emoji',
                description: 'Emoji do botão (ex: 🎫 ou <:nome:id>)',
                type: 3,
                required: false
            },
            {
                name: 'cor',
                description: 'Cor do botão',
                type: 3,
                required: false,
                choices: [
                    { name: 'Azul', value: 'Primary' },
                    { name: 'Cinza', value: 'Secondary' },
                    { name: 'Verde', value: 'Success' },
                    { name: 'Vermelho', value: 'Danger' }
                ]
            }
        ]
    },
    {
        name: 'remove_button',
        description: 'Remove um botão do painel de tickets',
        options: [
            {
                name: 'label',
                description: 'Label do botão a ser removido',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'list_buttons',
        description: 'Lista todos os botões configurados no painel'
    },
    {
        name: 'set_select',
        description: 'Configura select menu com setores/departamentos',
        options: [
            {
                name: 'ativo',
                description: 'Ativar ou desativar select menu',
                type: 5,
                required: true
            }
        ]
    },
    {
        name: 'add_setor',
        description: 'Adiciona um setor ao select menu',
        options: [
            {
                name: 'nome',
                description: 'Nome do setor (ex: Suporte, Vendas, Financeiro)',
                type: 3,
                required: true
            },
            {
                name: 'descricao',
                description: 'Descrição do setor',
                type: 3,
                required: true
            },
            {
                name: 'emoji',
                description: 'Emoji do setor',
                type: 3,
                required: false
            }
        ]
    },
    {
        name: 'remove_setor',
        description: 'Remove um setor do select menu',
        options: [
            {
                name: 'nome',
                description: 'Nome do setor a ser removido',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'list_setores',
        description: 'Lista todos os setores configurados'
    }
];

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    
    try {
        console.log('🔄 Registrando comandos slash...');
        
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        
        console.log('✅ Comandos registrados com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao registrar comandos:', error);
    }
}

client.once('clientReady', () => {
    console.log(`🤖 Bot online como ${client.user.tag}`);
    console.log(`📊 Servidores: ${client.guilds.cache.size}`);
    
    loadConfig();
    registerCommands();
    
    client.user.setActivity('tickets | /ticket', { type: 'WATCHING' });
    
    setInterval(() => {
        console.log(`⏰ [${new Date().toLocaleString('pt-BR')}] Bot ativo - ${client.guilds.cache.size} servidores`);
    }, 5 * 60 * 1000);
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        
        if (interaction.commandName === 'setup') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ 
                    content: '❌ Você precisa ser um administrador para usar este comando!', 
                    ephemeral: true 
                });
            }

            const cargo = interaction.options.getRole('cargo');
            const categoria = interaction.options.getChannel('categoria');

            if (!config[interaction.guildId]) {
                config[interaction.guildId] = {};
            }

            config[interaction.guildId].supportRoleId = cargo.id;
            config[interaction.guildId].categoryId = categoria.id;
            if (!config[interaction.guildId].supportRoles) {
                config[interaction.guildId].supportRoles = [cargo.id];
            }
            saveConfig();

            const embed = new EmbedBuilder()
                .setTitle('✅ Configuração Concluída!')
                .setDescription(`**Sistema de tickets configurado com sucesso!**\n\n📌 **Cargo de Suporte:** ${cargo}\n📁 **Categoria:** ${categoria.name}`)
                .setColor(0x00FF00)
                .setFooter({ text: 'Powered by Neves Store' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (interaction.commandName === 'ticket') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return interaction.reply({ 
                    content: '❌ Você não tem permissão para usar este comando!', 
                    ephemeral: true 
                });
            }

            const guildConfig = config[interaction.guildId] || {};
            
            if (!guildConfig.setores || guildConfig.setores.length === 0) {
                return interaction.reply({ 
                    content: '❌ nada configurado! Use `/add_setor` para adicionar setores ao menu.', 
                    ephemeral: true 
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('**Bem-vindo à Central de Atendimento!**')
                .setDescription(
                    '**Para que possamos iniciar o seu atendimento, selecione o setor desejado no menu abaixo.**\n\n' +
                    '**H͟o͟r͟á͟r͟i͟o͟ ͟d͟e͟ ͟A͟t͟e͟n͟d͟i͟m͟e͟n͟t͟o͟:**\n\n' +
                    '> Segunda a Sexta\n8:00h as 22:30h\n\n' +
                    '> Sábado e Domingo\n7:00h as 21:30h\n\n' +
                    '> **Caso envie mensagens fora do horário de atendimento, aguarde. Assim que um staff estiver disponível, irá lhe atender com o setor de atendimento selecionado. Por favor, evite menções e abrir ticket à toa sem precisar de suporte.**'
                )
                .setColor(FF0000)
                .setFooter({ text: 'Powered by Neves Store' })
                .setImage("https://i.postimg.cc/MHQjFcXB/standard-7.gif")
                .setTimestamp();

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_setor')
                .setPlaceholder('Selecione uma opção para abrir ticket');

            guildConfig.setores.forEach(setor => {
                const option = new StringSelectMenuOptionBuilder()
                    .setLabel(setor.nome)
                    .setDescription(setor.descricao)
                    .setValue(setor.nome);
                
                if (setor.emoji) {
                    option.setEmoji(setor.emoji);
                }
                
                selectMenu.addOptions(option);
            });

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await interaction.channel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: '✅ Painel de tickets enviado!', ephemeral: true });
        }

        if (interaction.commandName === 'logs') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ 
                    content: '❌ Você precisa ser um administrador para usar este comando!', 
                    ephemeral: true 
                });
            }

            const canal = interaction.options.getChannel('canal');

            if (!config[interaction.guildId]) {
                config[interaction.guildId] = {};
            }

            config[interaction.guildId].logsChannelId = canal.id;
            saveConfig();

            const embed = new EmbedBuilder()
                .setTitle('✅ Canal de Logs Configurado!')
                .setDescription(`**Canal de logs configurado com sucesso!**\n\n📋 **Canal de Logs:** ${canal}`)
                .setColor(0x00FF00)
                .setFooter({ text: 'Powered by Neves Store' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (interaction.commandName === 'add_cargo') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ Você precisa ser um administrador!', ephemeral: true });
            }

            const cargo = interaction.options.getRole('cargo');
            
            if (!config[interaction.guildId]) {
                config[interaction.guildId] = {};
            }
            if (!config[interaction.guildId].supportRoles) {
                config[interaction.guildId].supportRoles = [];
            }

            if (config[interaction.guildId].supportRoles.includes(cargo.id)) {
                return interaction.reply({ content: '❌ Este cargo já está configurado!', ephemeral: true });
            }

            config[interaction.guildId].supportRoles.push(cargo.id);
            saveConfig();

            const embed = new EmbedBuilder()
                .setTitle('✅ Cargo Adicionado!')
                .setDescription(`**Cargo de suporte adicionado com sucesso!**\n\n📌 **Cargo:** ${cargo}`)
                .setColor(0x00FF00)
                .setFooter({ text: 'Powered by Neves Store' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (interaction.commandName === 'remove_cargo') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ Você precisa ser um administrador!', ephemeral: true });
            }

            const cargo = interaction.options.getRole('cargo');
            
            if (!config[interaction.guildId]?.supportRoles) {
                return interaction.reply({ content: '❌ Nenhum cargo configurado ainda!', ephemeral: true });
            }

            const index = config[interaction.guildId].supportRoles.indexOf(cargo.id);
            if (index === -1) {
                return interaction.reply({ content: '❌ Este cargo não está na lista!', ephemeral: true });
            }

            config[interaction.guildId].supportRoles.splice(index, 1);
            saveConfig();

            const embed = new EmbedBuilder()
                .setTitle('🗑️ Cargo Removido!')
                .setDescription(`**Cargo removido da lista de suporte!**\n\n📌 **Cargo:** ${cargo}`)
                .setColor(0xFF6B6B)
                .setFooter({ text: 'Powered by Neves Store' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (interaction.commandName === 'list_cargos') {
            const guildConfig = config[interaction.guildId];
            
            if (!guildConfig?.supportRoles || guildConfig.supportRoles.length === 0) {
                return interaction.reply({ content: '❌ Nenhum cargo de suporte configurado!', ephemeral: true });
            }

            const cargos = guildConfig.supportRoles.map(roleId => {
                const role = interaction.guild.roles.cache.get(roleId);
                return role ? `• ${role}` : `• ID: ${roleId} (cargo não encontrado)`;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setTitle('📋 Cargos de Suporte Configurados')
                .setDescription(cargos)
                .setColor(0x0099FF)
                .setFooter({ text: 'Powered by Neves Store' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (interaction.commandName === 'add_button') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ Você precisa ser um administrador!', ephemeral: true });
            }

            const label = interaction.options.getString('label');
            const emoji = interaction.options.getString('emoji');
            const cor = interaction.options.getString('cor') || 'Primary';

            if (!config[interaction.guildId]) {
                config[interaction.guildId] = {};
            }
            if (!config[interaction.guildId].customButtons) {
                config[interaction.guildId].customButtons = [];
            }

            if (config[interaction.guildId].customButtons.some(btn => btn.label === label)) {
                return interaction.reply({ content: '❌ Já existe um botão com esse label!', ephemeral: true });
            }

            config[interaction.guildId].customButtons.push({ label, emoji, style: cor });
            saveConfig();

            const embed = new EmbedBuilder()
                .setTitle('✅ Botão Adicionado!')
                .setDescription(`**Botão adicionado ao painel!**\n\n🏷️ **Label:** ${label}\n${emoji ? `😀 **Emoji:** ${emoji}\n` : ''}🎨 **Cor:** ${cor}`)
                .setColor(0x00FF00)
                .setFooter({ text: 'Powered by Neves Store' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (interaction.commandName === 'remove_button') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ Você precisa ser um administrador!', ephemeral: true });
            }

            const label = interaction.options.getString('label');
            
            if (!config[interaction.guildId]?.customButtons) {
                return interaction.reply({ content: '❌ Nenhum botão configurado ainda!', ephemeral: true });
            }

            const index = config[interaction.guildId].customButtons.findIndex(btn => btn.label === label);
            if (index === -1) {
                return interaction.reply({ content: '❌ Botão não encontrado!', ephemeral: true });
            }

            config[interaction.guildId].customButtons.splice(index, 1);
            saveConfig();

            const embed = new EmbedBuilder()
                .setTitle('🗑️ Botão Removido!')
                .setDescription(`**Botão removido do painel!**\n\n🏷️ **Label:** ${label}`)
                .setColor(0xFF6B6B)
                .setFooter({ text: 'Powered by Neves Store' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (interaction.commandName === 'list_buttons') {
            const guildConfig = config[interaction.guildId];
            
            if (!guildConfig?.customButtons || guildConfig.customButtons.length === 0) {
                return interaction.reply({ content: '❌ Nenhum botão personalizado configurado!', ephemeral: true });
            }

            const botoes = guildConfig.customButtons.map((btn, i) => 
                `${i + 1}. **${btn.label}** ${btn.emoji || ''} - Cor: ${btn.style}`
            ).join('\n');

            const embed = new EmbedBuilder()
                .setTitle('🔘 Botões Configurados')
                .setDescription(botoes)
                .setColor(0x0099FF)
                .setFooter({ text: 'Powered by Neves Store' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (interaction.commandName === 'set_select') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ Você precisa ser um administrador!', ephemeral: true });
            }

            const ativo = interaction.options.getBoolean('ativo');

            if (!config[interaction.guildId]) {
                config[interaction.guildId] = {};
            }

            config[interaction.guildId].useSelectMenu = ativo;
            saveConfig();

            const embed = new EmbedBuilder()
                .setTitle(ativo ? '✅ Select Menu Ativado!' : '❌ Select Menu Desativado!')
                .setDescription(ativo ? 
                    'O painel de tickets agora usará um select menu para escolher setores.' :
                    'O painel de tickets voltará a usar apenas botões.')
                .setColor(ativo ? 0x00FF00 : 0xFF6B6B)
                .setFooter({ text: 'Powered by Neves Store' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (interaction.commandName === 'add_setor') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ Você precisa ser um administrador!', ephemeral: true });
            }

            const nome = interaction.options.getString('nome');
            const descricao = interaction.options.getString('descricao');
            const emoji = interaction.options.getString('emoji');

            if (!config[interaction.guildId]) {
                config[interaction.guildId] = {};
            }
            if (!config[interaction.guildId].setores) {
                config[interaction.guildId].setores = [];
            }

            if (config[interaction.guildId].setores.some(s => s.nome === nome)) {
                return interaction.reply({ content: '❌ Já existe um setor com esse nome!', ephemeral: true });
            }

            config[interaction.guildId].setores.push({ nome, descricao, emoji });
            saveConfig();

            const embed = new EmbedBuilder()
                .setTitle('✅ Setor Adicionado!')
                .setDescription(`**Setor adicionado ao select menu!**\n\n📌 **Nome:** ${nome}\n📝 **Descrição:** ${descricao}${emoji ? `\n😀 **Emoji:** ${emoji}` : ''}`)
                .setColor(0x00FF00)
                .setFooter({ text: 'Powered by Neves store' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (interaction.commandName === 'remove_setor') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ Você precisa ser um administrador!', ephemeral: true });
            }

            const nome = interaction.options.getString('nome');
            
            if (!config[interaction.guildId]?.setores) {
                return interaction.reply({ content: '❌ Nenhum setor configurado ainda!', ephemeral: true });
            }

            const index = config[interaction.guildId].setores.findIndex(s => s.nome === nome);
            if (index === -1) {
                return interaction.reply({ content: '❌ Setor não encontrado!', ephemeral: true });
            }

            config[interaction.guildId].setores.splice(index, 1);
            saveConfig();

            const embed = new EmbedBuilder()
                .setTitle('🗑️ Setor Removido!')
                .setDescription(`**Setor removido do select menu!**\n\n📌 **Nome:** ${nome}`)
                .setColor(0xFF6B6B)
                .setFooter({ text: 'Powered by Neves Store' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (interaction.commandName === 'list_setores') {
            const guildConfig = config[interaction.guildId];
            
            if (!guildConfig?.setores || guildConfig.setores.length === 0) {
                return interaction.reply({ content: '❌ Nenhum setor configurado ainda!', ephemeral: true });
            }

            const setores = guildConfig.setores.map((s, i) => 
                `${i + 1}. ${s.emoji || '📌'} **${s.nome}** - ${s.descricao}`
            ).join('\n');

            const embed = new EmbedBuilder()
                .setTitle('📂 Setores Configurados')
                .setDescription(setores)
                .setColor(0x0099FF)
                .setFooter({ text: 'Powered by Neves Store' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (interaction.commandName === 'adduser') {
            const channel = interaction.channel;

            if (!channel.name.startsWith('ticket-de-')) {
                return interaction.reply({ 
                    content: '❌ Este comando só pode ser usado em canais de ticket!', 
                    ephemeral: true 
                });
            }

            const usuario = interaction.options.getUser('usuario');

            try {
                await channel.permissionOverwrites.create(usuario.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                });

                const addEmbed = new EmbedBuilder()
                    .setTitle('✅ Usuário Adicionado')
                    .setDescription(`${usuario} foi adicionado ao ticket por ${interaction.user}.`)
                    .setColor(0x00FF00)
                    .setFooter({ text: 'Powered by Neves Store' })
                    .setTimestamp();

                await interaction.reply({ embeds: [addEmbed] });
                console.log(`✅ Usuário ${usuario.tag} adicionado ao ${channel.name} por ${interaction.user.tag}`);
            } catch (error) {
                console.error('❌ Erro ao adicionar usuário:', error);
                return interaction.reply({ 
                    content: '❌ Erro ao adicionar o usuário. Verifique as permissões do bot.', 
                    ephemeral: true 
                });
            }
        }

        if (interaction.commandName === 'remove_user') {
            const channel = interaction.channel;

            if (!channel.name.startsWith('ticket-de-')) {
                return interaction.reply({ 
                    content: '❌ Este comando só pode ser usado em canais de ticket!', 
                    ephemeral: true 
                });
            }

            const usuario = interaction.options.getUser('usuario');

            try {
                await channel.permissionOverwrites.delete(usuario.id);

                const removeEmbed = new EmbedBuilder()
                    .setTitle('🚫 Usuário Removido')
                    .setDescription(`${usuario} foi removido do ticket por ${interaction.user}.`)
                    .setColor(0xFF6B6B)
                    .setFooter({ text: 'Powered by Neves Store' })
                    .setTimestamp();

                await interaction.reply({ embeds: [removeEmbed] });
                console.log(`🚫 Usuário ${usuario.tag} removido do ${channel.name} por ${interaction.user.tag}`);
            } catch (error) {
                console.error('❌ Erro ao remover usuário:', error);
                return interaction.reply({ 
                    content: '❌ Erro ao remover o usuário. Verifique as permissões do bot.', 
                    ephemeral: true 
                });
            }
        }
    }

    if (interaction.isButton()) {
        
        if (interaction.customId === 'criar_ticket') {
            const guildConfig = config[interaction.guildId];

            if (!guildConfig || !guildConfig.supportRoleId || !guildConfig.categoryId) {
                return interaction.reply({ 
                    content: '❌ O sistema de tickets não foi configurado! Peça a um administrador para usar `/setup`.', 
                    ephemeral: true 
                });
            }

            const sanitizedUsername = sanitizeUsername(interaction.user.username);
            const ticketChannelName = `ticket-de-${sanitizedUsername}`;
            
            const existingChannel = interaction.guild.channels.cache.find(
                ch => ch.name === ticketChannelName && ch.type === ChannelType.GuildText
            );

            if (existingChannel) {
                return interaction.reply({ 
                    content: `❌ Você já tem um ticket aberto: ${existingChannel}`, 
                    ephemeral: true 
                });
            }

            await interaction.reply({ 
                content: '🎫 Criando seu ticket...', 
                ephemeral: true 
            });

            try {
                const ticketChannel = await interaction.guild.channels.create({
                    name: ticketChannelName,
                    type: ChannelType.GuildText,
                    parent: guildConfig.categoryId,
                    permissionOverwrites: [
                        {
                            id: interaction.guild.roles.everyone.id,
                            deny: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            id: interaction.user.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel, 
                                PermissionFlagsBits.SendMessages, 
                                PermissionFlagsBits.ReadMessageHistory
                            ]
                        },
                        {
                            id: guildConfig.supportRoleId,
                            allow: [
                                PermissionFlagsBits.ViewChannel, 
                                PermissionFlagsBits.SendMessages, 
                                PermissionFlagsBits.ReadMessageHistory
                            ]
                        }
                    ]
                });

                const ticketEmbed = new EmbedBuilder()
                    .setTitle('🎫 Ticket Aberto')
                    .setDescription(`Olá ${interaction.user}, bem-vindo ao seu ticket!\n\nUm membro da equipe de suporte irá atendê-lo em breve.\n\n**Para fechar ou reivindicar este ticket, clique nos botões abaixo.**`)
                    .setColor(0x00FF00)
                    .setFooter({ text: 'Powered by Neves Store' })
                    .setTimestamp();

                const claimButton = new ButtonBuilder()
                    .setCustomId('reivindicar_ticket')
                    .setLabel('Reivindicar Ticket')
                    .setEmoji('✋')
                    .setStyle(ButtonStyle.Success);

                const closeButton = new ButtonBuilder()
                    .setCustomId('fechar_ticket')
                    .setLabel('Fechar Ticket')
                    .setEmoji('🔒')
                    .setStyle(ButtonStyle.Danger);

                const row = new ActionRowBuilder().addComponents(claimButton, closeButton);

                await ticketChannel.send({ 
                    content: `${interaction.user} | <@&${guildConfig.supportRoleId}>`,
                    embeds: [ticketEmbed], 
                    components: [row] 
                });

                console.log(`✅ Ticket criado: ${ticketChannelName} por ${interaction.user.tag}`);

                if (guildConfig.logsChannelId) {
                    const logsChannel = interaction.guild.channels.cache.get(guildConfig.logsChannelId);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('📂 Ticket Aberto')
                            .setDescription(`**Usuário:** ${interaction.user} (${interaction.user.tag})\n**ID:** ${interaction.user.id}\n**Canal:** ${ticketChannel}\n**Horário:** <t:${Math.floor(Date.now() / 1000)}:F>`)
                            .setColor(0x00FF00)
                            .setFooter({ text: 'Powered by Neves Store' })
                            .setTimestamp();
                        
                        await logsChannel.send({ embeds: [logEmbed] }).catch(err => {
                            console.error('❌ Erro ao enviar log de ticket aberto:', err);
                        });
                    }
                }

            } catch (error) {
                console.error('❌ Erro ao criar ticket:', error);
                return interaction.followUp({ 
                    content: '❌ Erro ao criar o ticket. Verifique as permissões do bot.', 
                    ephemeral: true 
                });
            }
        }

        if (interaction.customId === 'reivindicar_ticket') {
            const channel = interaction.channel;

            if (!channel.name.startsWith('ticket-de-')) {
                return interaction.reply({ 
                    content: '❌ Este comando só pode ser usado em canais de ticket!', 
                    ephemeral: true 
                });
            }

            const guildConfig = config[interaction.guildId];
            const supportRole = interaction.guild.roles.cache.get(guildConfig.supportRoleId);

            if (!interaction.member.roles.cache.has(guildConfig.supportRoleId)) {
                return interaction.reply({ 
                    content: '❌ Apenas membros da equipe de suporte podem reivindicar tickets!', 
                    ephemeral: true 
                });
            }

            const claimEmbed = new EmbedBuilder()
                .setTitle('✋ Ticket Reivindicado')
                .setDescription(`Este ticket foi reivindicado por ${interaction.user}.\n\nEle será responsável pelo atendimento.`)
                .setColor(0xFFD700)
                .setFooter({ text: 'Powered by Neves Store' })
                .setTimestamp();

            await interaction.reply({ embeds: [claimEmbed] });
            console.log(`✋ Ticket ${channel.name} reivindicado por ${interaction.user.tag}`);
        }

        if (interaction.customId === 'fechar_ticket') {
            const channel = interaction.channel;

            if (!channel.name.startsWith('ticket-de-')) {
                return interaction.reply({ 
                    content: '❌ Este comando só pode ser usado em canais de ticket!', 
                    ephemeral: true 
                });
            }

            const closeEmbed = new EmbedBuilder()
                .setTitle('🔒 Ticket Fechado')
                .setDescription(`Ticket fechado por ${interaction.user}.\n\nEste canal será deletado em 5 segundos...`)
                .setColor(0xFF0000)
                .setFooter({ text: 'Powered by Neves Store' })
                .setTimestamp();

            await interaction.reply({ embeds: [closeEmbed] });

            console.log(`🔒 Ticket fechado: ${channel.name} por ${interaction.user.tag}`);

            const guildConfig = config[interaction.guildId];
            if (guildConfig && guildConfig.logsChannelId) {
                const logsChannel = interaction.guild.channels.cache.get(guildConfig.logsChannelId);
                if (logsChannel) {
                    const username = channel.name.replace('ticket-de-', '');
                    
                    const logEmbed = new EmbedBuilder()
                        .setTitle('🔒 Ticket Fechado')
                        .setDescription(
                            `**Username do Ticket:** ${username}\n` +
                            `**Fechado por:** ${interaction.user} (${interaction.user.tag})\n` +
                            `**Canal:** #${channel.name}\n` +
                            `**Horário:** <t:${Math.floor(Date.now() / 1000)}:F>`
                        )
                        .setColor(0xFF0000)
                        .setFooter({ text: 'Powered by Neves Store' })
                        .setTimestamp();
                    
                    await logsChannel.send({ embeds: [logEmbed] }).catch(err => {
                        console.error('❌ Erro ao enviar log de ticket fechado:', err);
                    });
                }
            }

            setTimeout(() => {
                channel.delete().catch(err => {
                    console.error('❌ Erro ao deletar canal:', err);
                });
            }, 5000);
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select_setor') {
            const guildConfig = config[interaction.guildId];

            if (!guildConfig || !guildConfig.supportRoleId || !guildConfig.categoryId) {
                return interaction.reply({ 
                    content: '❌ O sistema de tickets não foi configurado! Peça a um administrador para usar `/setup`.', 
                    ephemeral: true 
                });
            }

            const setorSelecionado = interaction.values[0];
            const sanitizedUsername = sanitizeUsername(interaction.user.username);
            const ticketChannelName = `ticket-de-${sanitizedUsername}`;
            
            const existingChannel = interaction.guild.channels.cache.find(
                ch => ch.name === ticketChannelName && ch.type === ChannelType.GuildText
            );

            if (existingChannel) {
                return interaction.reply({ 
                    content: `❌ Você já tem um ticket aberto: ${existingChannel}`, 
                    ephemeral: true 
                });
            }

            await interaction.reply({ 
                content: `🎫 Criando seu ticket no setor **${setorSelecionado}**...`, 
                ephemeral: true 
            });

            try {
                const permissionOverwrites = [
                    {
                        id: interaction.guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: interaction.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel, 
                            PermissionFlagsBits.SendMessages, 
                            PermissionFlagsBits.ReadMessageHistory
                        ]
                    }
                ];

                if (guildConfig.supportRoles && guildConfig.supportRoles.length > 0) {
                    guildConfig.supportRoles.forEach(roleId => {
                        permissionOverwrites.push({
                            id: roleId,
                            allow: [
                                PermissionFlagsBits.ViewChannel, 
                                PermissionFlagsBits.SendMessages, 
                                PermissionFlagsBits.ReadMessageHistory
                            ]
                        });
                    });
                } else if (guildConfig.supportRoleId) {
                    permissionOverwrites.push({
                        id: guildConfig.supportRoleId,
                        allow: [
                            PermissionFlagsBits.ViewChannel, 
                            PermissionFlagsBits.SendMessages, 
                            PermissionFlagsBits.ReadMessageHistory
                        ]
                    });
                }

                const ticketChannel = await interaction.guild.channels.create({
                    name: ticketChannelName,
                    type: ChannelType.GuildText,
                    parent: guildConfig.categoryId,
                    permissionOverwrites: permissionOverwrites
                });

                const ticketEmbed = new EmbedBuilder()
                    .setTitle('🎫 Ticket Aberto')
                    .setDescription(`Olá ${interaction.user}, bem-vindo ao seu ticket!\n\n**Setor selecionado:** ${setorSelecionado}\n\nUm membro da equipe de suporte irá atendê-lo em breve.\n\n**Para fechar ou reivindicar este ticket, clique nos botões abaixo.**`)
                    .setColor(0x00FF00)
                    .setFooter({ text: 'Powered by Neves Store' })
                    .setTimestamp();

                const claimButton = new ButtonBuilder()
                    .setCustomId('reivindicar_ticket')
                    .setLabel('Reivindicar Ticket')
                    .setEmoji('✋')
                    .setStyle(ButtonStyle.Success);

                const closeButton = new ButtonBuilder()
                    .setCustomId('fechar_ticket')
                    .setLabel('Fechar Ticket')
                    .setEmoji('🔒')
                    .setStyle(ButtonStyle.Danger);

                const row = new ActionRowBuilder().addComponents(claimButton, closeButton);

                const mentionRoles = guildConfig.supportRoles && guildConfig.supportRoles.length > 0
                    ? guildConfig.supportRoles.map(roleId => `<@&${roleId}>`).join(' ')
                    : `<@&${guildConfig.supportRoleId}>`;

                await ticketChannel.send({ 
                    content: `${interaction.user} | ${mentionRoles}`,
                    embeds: [ticketEmbed], 
                    components: [row] 
                });

                console.log(`✅ Ticket criado: ${ticketChannelName} por ${interaction.user.tag} - Setor: ${setorSelecionado}`);

                if (guildConfig.logsChannelId) {
                    const logsChannel = interaction.guild.channels.cache.get(guildConfig.logsChannelId);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('📂 Ticket Aberto')
                            .setDescription(`**Usuário:** ${interaction.user} (${interaction.user.tag})\n**ID:** ${interaction.user.id}\n**Setor:** ${setorSelecionado}\n**Canal:** ${ticketChannel}\n**Horário:** <t:${Math.floor(Date.now() / 1000)}:F>`)
                            .setColor(0x00FF00)
                            .setFooter({ text: 'Powered by Neves Store' })
                            .setTimestamp();
                        
                        await logsChannel.send({ embeds: [logEmbed] }).catch(err => {
                            console.error('❌ Erro ao enviar log de ticket aberto:', err);
                        });
                    }
                }

            } catch (error) {
                console.error('❌ Erro ao criar ticket:', error);
                return interaction.followUp({ 
                    content: '❌ Erro ao criar o ticket. Verifique as permissões do bot.', 
                    ephemeral: true 
                });
            }
        }
    }
});

const app = express();
const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Discord Ticket Bot - Status</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        background: #0d1117; 
                        color: #c9d1d9; 
                        display: flex; 
                        justify-content: center; 
                        align-items: center; 
                        height: 100vh; 
                        margin: 0;
                    }
                    .container { 
                        text-align: center; 
                        padding: 40px; 
                        background: #161b22; 
                        border-radius: 10px; 
                        box-shadow: 0 0 20px rgba(0,0,0,0.5);
                    }
                    h1 { color: #58a6ff; }
                    .status { 
                        color: #3fb950; 
                        font-size: 24px; 
                        font-weight: bold; 
                        margin: 20px 0;
                    }
                    .info { 
                        margin: 10px 0; 
                        color: #8b949e;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 Discord Ticket Bot</h1>
                    <div class="status">✅ I'm alive!</div>
                    <div class="info">Bot Status: ${client.user ? 'Online ✅' : 'Offline ❌'}</div>
                    <div class="info">Bot Name: ${client.user ? client.user.tag : 'N/A'}</div>
                    <div class="info">Servers: ${client.guilds ? client.guilds.cache.size : '0'}</div>
                    <div class="info">Uptime: ${process.uptime().toFixed(0)}s</div>
                    <p style="margin-top: 30px; color: #8b949e;">Powered by STG Store</p>
                </div>
            </body>
        </html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor HTTP rodando na porta ${PORT}`);
    console.log(`🔗 Keep-alive ativado para evitar hibernação`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️  Porta ${PORT} já está em uso. Tentando porta alternativa...`);
        const altPort = PORT + 1;
        app.listen(altPort, '0.0.0.0', () => {
            console.log(`🌐 Servidor HTTP rodando na porta ${altPort}`);
        });
    } else {
        console.error('❌ Erro no servidor HTTP:', err);
    }
});

client.login(process.env.TOKEN).catch(err => {
    console.error('❌ Erro ao fazer login no Discord:', err);
    console.error('⚠️  Verifique se o TOKEN no arquivo .env está correto!');
    process.exit(1);
});
