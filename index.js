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

// Sistema de contexto: rastreia qual painel cada usuário está editando
const userPanelContext = new Map();

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
            config = JSON.parse(data);
            
            // Migração automática: converter config antiga para novo formato
            Object.keys(config).forEach(guildId => {
                if (!config[guildId].panels) {
                    console.log(`🔄 Migrando configuração antiga para ${guildId}...`);
                    const oldConfig = { ...config[guildId] };
                    config[guildId] = {
                        panels: {
                            'default': {
                                name: 'Painel Padrão',
                                ...oldConfig
                            }
                        }
                    };
                }
            });
            
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

function sanitizePanelId(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 32);
}

function getSelectedPanel(userId, guildId) {
    const contextKey = `${guildId}-${userId}`;
    return userPanelContext.get(contextKey);
}

function setSelectedPanel(userId, guildId, panelId) {
    const contextKey = `${guildId}-${userId}`;
    userPanelContext.set(contextKey, panelId);
}

function getPanelConfig(guildId, panelId) {
    if (!config[guildId]?.panels?.[panelId]) {
        return null;
    }
    return config[guildId].panels[panelId];
}

const commands = [
    {
        name: 'criar_painel',
        description: 'Cria um novo painel de tickets',
        options: [
            {
                name: 'nome',
                description: 'Nome do painel (ex: Suporte, Vendas, VIP)',
                type: 3,
                required: true
            },
            {
                name: 'tipo',
                description: 'Tipo de interface do painel',
                type: 3,
                required: false,
                choices: [
                    { name: 'Select Menu (Menu Dropdown)', value: 'select_menu' },
                    { name: 'Botões', value: 'buttons' }
                ]
            }
        ]
    },
    {
        name: 'listar_paineis',
        description: 'Lista todos os painéis de tickets configurados'
    },
    {
        name: 'selecionar_painel',
        description: 'Seleciona qual painel deseja editar',
        options: [
            {
                name: 'painel',
                description: 'ID do painel a selecionar',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'enviar_painel',
        description: 'Envia um painel de tickets no canal atual',
        options: [
            {
                name: 'painel',
                description: 'ID do painel a enviar',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'deletar_painel',
        description: 'Deleta um painel de tickets',
        options: [
            {
                name: 'painel',
                description: 'ID do painel a deletar',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'setup',
        description: 'Configura o painel selecionado (cargo de suporte e categoria)',
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
        description: 'Configura o canal de logs do painel selecionado',
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
        description: 'Adiciona um cargo de suporte ao painel selecionado',
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
        description: 'Remove um cargo de suporte do painel selecionado',
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
        description: 'Lista todos os cargos de suporte do painel selecionado'
    },
    {
        name: 'add_button',
        description: 'Adiciona um botão personalizado ao painel selecionado',
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
        description: 'Remove um botão do painel selecionado',
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
        description: 'Lista todos os botões do painel selecionado'
    },
    {
        name: 'add_setor',
        description: 'Adiciona um setor ao painel selecionado',
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
        description: 'Remove um setor do painel selecionado',
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
        description: 'Lista todos os setores do painel selecionado'
    },
    {
        name: 'edit_titulo',
        description: 'Edita o título do painel selecionado',
        options: [
            {
                name: 'titulo',
                description: 'Novo título do painel',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'edit_descricao',
        description: 'Edita a descrição do painel selecionado',
        options: [
            {
                name: 'descricao',
                description: 'Nova descrição do painel',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'edit_imagem',
        description: 'Edita a imagem (banner) do painel selecionado',
        options: [
            {
                name: 'url',
                description: 'URL da imagem (deixe vazio para remover)',
                type: 3,
                required: false
            }
        ]
    },
    {
        name: 'edit_thumbnail',
        description: 'Edita a thumbnail (miniatura) do painel selecionado',
        options: [
            {
                name: 'url',
                description: 'URL da thumbnail (deixe vazio para remover)',
                type: 3,
                required: false
            }
        ]
    },
    {
        name: 'edit_footer',
        description: 'Edita o rodapé do painel selecionado',
        options: [
            {
                name: 'texto',
                description: 'Texto do rodapé',
                type: 3,
                required: false
            }
        ]
    },
    {
        name: 'edit_color',
        description: 'Edita a cor da borda do embed do painel selecionado',
        options: [
            {
                name: 'cor',
                description: 'Cor em hexadecimal (ex: #0099FF) ou nome de cor',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'ver_personalizacao',
        description: 'Visualiza as configurações de personalização do painel selecionado'
    },
    {
        name: 'set_tipo_painel',
        description: 'Define o tipo de interface do painel (select menu ou botões)',
        options: [
            {
                name: 'tipo',
                description: 'Tipo de interface',
                type: 3,
                required: true,
                choices: [
                    { name: 'Select Menu (Menu Dropdown)', value: 'select_menu' },
                    { name: 'Botões', value: 'buttons' }
                ]
            }
        ]
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

client.once('ready', () => {
    console.log(`🤖 Bot online como ${client.user.tag}`);
    console.log(`📊 Servidores: ${client.guilds.cache.size}`);
    
    loadConfig();
    registerCommands();
    
    client.user.setActivity('tickets | /criar_painel', { type: 3 });
    
    setInterval(() => {
        console.log(`⏰ [${new Date().toLocaleString('pt-BR')}] Bot ativo - ${client.guilds.cache.size} servidores`);
    }, 5 * 60 * 1000);
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        
        // ========== COMANDOS DE GERENCIAMENTO DE PAINÉIS ==========
        
        if (interaction.commandName === 'criar_painel') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ 
                    content: '❌ Você precisa ser um administrador para usar este comando!', 
                    ephemeral: true 
                });
            }

            const nome = interaction.options.getString('nome');
            const tipo = interaction.options.getString('tipo') || 'select_menu';
            const panelId = sanitizePanelId(nome);

            if (!config[interaction.guildId]) {
                config[interaction.guildId] = { panels: {} };
            }
            if (!config[interaction.guildId].panels) {
                config[interaction.guildId].panels = {};
            }

            if (config[interaction.guildId].panels[panelId]) {
                return interaction.reply({ 
                    content: '❌ Já existe um painel com esse nome!', 
                    ephemeral: true 
                });
            }

            config[interaction.guildId].panels[panelId] = {
                name: nome,
                type: tipo,
                setores: [],
                customButtons: [],
                supportRoles: []
            };
            saveConfig();

            // Auto-selecionar o painel recém-criado
            setSelectedPanel(interaction.user.id, interaction.guildId, panelId);

            const tipoTexto = tipo === 'select_menu' ? 'Select Menu (Dropdown)' : 'Botões';
            const embed = new EmbedBuilder()
                .setTitle('✅ Painel Criado!')
                .setDescription(`**Painel de tickets criado com sucesso!**\n\n📋 **Nome:** ${nome}\n🆔 **ID:** \`${panelId}\`\n🎛️ **Tipo:** ${tipoTexto}\n\n✨ Este painel foi automaticamente selecionado. Use \`/setup\` para configurá-lo.`)
                .setColor(0x00FF00)
                .setFooter({ text: 'Powered by STG Store' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (interaction.commandName === 'listar_paineis') {
            const guildConfig = config[interaction.guildId];
            
            if (!guildConfig?.panels || Object.keys(guildConfig.panels).length === 0) {
                return interaction.reply({ 
                    content: '❌ Nenhum painel configurado ainda! Use `/criar_painel` para criar um.', 
                    ephemeral: true 
                });
            }

            const selectedPanelId = getSelectedPanel(interaction.user.id, interaction.guildId);
            
            const paineis = Object.entries(guildConfig.panels).map(([id, panel]) => {
                const isSelected = id === selectedPanelId ? '✅ ' : '';
                const setoresCount = panel.setores?.length || 0;
                const configured = panel.categoryId && panel.supportRoleId ? '✓' : '⚠️';
                return `${isSelected}**${panel.name}** ${configured}\n└ ID: \`${id}\` | Setores: ${setoresCount}`;
            }).join('\n\n');

            const embed = new EmbedBuilder()
                .setTitle('📋 Painéis de Tickets Configurados')
                .setDescription(paineis + '\n\n✅ = Selecionado | ✓ = Configurado | ⚠️ = Não configurado')
                .setColor(0x0099FF)
                .setFooter({ text: 'Use /selecionar_painel para escolher um painel' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (interaction.commandName === 'selecionar_painel') {
            const panelId = interaction.options.getString('painel');
            
            if (!config[interaction.guildId]?.panels?.[panelId]) {
                return interaction.reply({ 
                    content: '❌ Painel não encontrado! Use `/listar_paineis` para ver os disponíveis.', 
                    ephemeral: true 
                });
            }

            setSelectedPanel(interaction.user.id, interaction.guildId, panelId);
            const panel = config[interaction.guildId].panels[panelId];

            const embed = new EmbedBuilder()
                .setTitle('✅ Painel Selecionado!')
                .setDescription(`Você agora está editando: **${panel.name}**\n\nTodos os comandos de configuração serão aplicados a este painel.`)
                .setColor(0x00FF00)
                .setFooter({ text: 'Powered by STG Store' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (interaction.commandName === 'enviar_painel') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return interaction.reply({ 
                    content: '❌ Você não tem permissão para usar este comando!', 
                    ephemeral: true 
                });
            }

            const panelId = interaction.options.getString('painel');
            const panelConfig = getPanelConfig(interaction.guildId, panelId);
            
            if (!panelConfig) {
                return interaction.reply({ 
                    content: '❌ Painel não encontrado!', 
                    ephemeral: true 
                });
            }

            const panelType = panelConfig.type || 'select_menu';
            
            // Validar se tem setores (para select menu) ou botões (para buttons)
            if (panelType === 'select_menu') {
                if (!panelConfig.setores || panelConfig.setores.length === 0) {
                    return interaction.reply({ 
                        content: '❌ Este painel não tem setores configurados! Use `/selecionar_painel` e depois `/add_setor`.', 
                        ephemeral: true 
                    });
                }
            } else if (panelType === 'buttons') {
                if (!panelConfig.customButtons || panelConfig.customButtons.length === 0) {
                    return interaction.reply({ 
                        content: '❌ Este painel não tem botões configurados! Use `/selecionar_painel` e depois `/add_button`.', 
                        ephemeral: true 
                    });
                }
            }

            const custom = panelConfig.customization || {};
            
            const defaultTitle = `**${panelConfig.name}**`;
            const defaultDescription = '**Para que possamos iniciar o seu atendimento, selecione o setor desejado no menu abaixo.**\n\n' +
                '**H͟o͟r͟á͟r͟i͟o͟ ͟d͟e͟ ͟A͟t͟e͟n͟d͟i͟m͟e͟n͟t͟o͟:**\n\n' +
                '> Segunda a Sexta\n8:00h as 22:30h\n\n' +
                '> Sábado e Domingo\n7:00h as 21:30h\n\n' +
                '> **Caso envie mensagens fora do horário de atendimento, aguarde. Assim que um staff estiver disponível, irá lhe atender com o setor de atendimento selecionado. Por favor, evite menções e abrir ticket à toa sem precisar de suporte.**';
            const defaultImage = "https://i.postimg.cc/cCfQFsxF/standard-14.gif";

            const embed = new EmbedBuilder()
                .setTitle(custom.title || defaultTitle)
                .setDescription(custom.description || defaultDescription)
                .setColor(custom.color !== undefined ? custom.color : 0x0099FF)
                .setFooter({ text: custom.footer || 'Powered by STG Store' })
                .setTimestamp();

            if (custom.image !== undefined) {
                if (custom.image) {
                    embed.setImage(custom.image);
                }
            } else {
                embed.setImage(defaultImage);
            }

            if (custom.thumbnail) {
                embed.setThumbnail(custom.thumbnail);
            }

            const components = [];

            if (panelType === 'select_menu') {
                // Renderizar Select Menu
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`select_setor:${panelId}`)
                    .setPlaceholder('Selecione uma opção para abrir ticket');

                panelConfig.setores.forEach(setor => {
                    const option = new StringSelectMenuOptionBuilder()
                        .setLabel(setor.nome)
                        .setDescription(setor.descricao)
                        .setValue(setor.nome);
                    
                    if (setor.emoji) {
                        option.setEmoji(setor.emoji);
                    }
                    
                    selectMenu.addOptions(option);
                });

                components.push(new ActionRowBuilder().addComponents(selectMenu));
            } else {
                // Renderizar Botões
                const buttons = [];
                panelConfig.customButtons.forEach(btn => {
                    const button = new ButtonBuilder()
                        .setCustomId(`create_ticket:${panelId}:${btn.label}`)
                        .setLabel(btn.label)
                        .setStyle(ButtonStyle[btn.style] || ButtonStyle.Primary);
                    
                    if (btn.emoji) {
                        button.setEmoji(btn.emoji);
                    }
                    
                    buttons.push(button);
                });

                // Discord limita 5 botões por ActionRow, então dividimos se necessário
                for (let i = 0; i < buttons.length; i += 5) {
                    const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
                    components.push(row);
                }
            }

            await interaction.channel.send({ embeds: [embed], components });
            return interaction.reply({ content: '✅ Painel de tickets enviado!', ephemeral: true });
        }

        if (interaction.commandName === 'deletar_painel') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ 
                    content: '❌ Você precisa ser um administrador!', 
                    ephemeral: true 
                });
            }

            const panelId = interaction.options.getString('painel');
            
            if (!config[interaction.guildId]?.panels?.[panelId]) {
                return interaction.reply({ 
                    content: '❌ Painel não encontrado!', 
                    ephemeral: true 
                });
            }

            const panelName = config[interaction.guildId].panels[panelId].name;
            delete config[interaction.guildId].panels[panelId];
            saveConfig();

            // Limpar contexto de usuários que tinham esse painel selecionado
            userPanelContext.forEach((value, key) => {
                if (value === panelId && key.startsWith(interaction.guildId)) {
                    userPanelContext.delete(key);
                }
            });

            const embed = new EmbedBuilder()
                .setTitle('🗑️ Painel Deletado!')
                .setDescription(`O painel **${panelName}** foi removido.`)
                .setColor(0xFF6B6B)
                .setFooter({ text: 'Powered by STG Store' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ========== COMANDOS QUE REQUEREM PAINEL SELECIONADO ==========

        const commandsRequiringPanel = [
            'setup', 'logs', 'add_cargo', 'remove_cargo', 'list_cargos',
            'add_button', 'remove_button', 'list_buttons',
            'add_setor', 'remove_setor', 'list_setores',
            'edit_titulo', 'edit_descricao', 'edit_imagem', 'edit_thumbnail', 
            'edit_footer', 'edit_color', 'ver_personalizacao', 'set_tipo_painel'
        ];

        if (commandsRequiringPanel.includes(interaction.commandName)) {
            const selectedPanelId = getSelectedPanel(interaction.user.id, interaction.guildId);
            
            if (!selectedPanelId) {
                return interaction.reply({ 
                    content: '❌ Você precisa selecionar um painel primeiro! Use `/selecionar_painel` ou `/criar_painel`.', 
                    ephemeral: true 
                });
            }

            const panelConfig = getPanelConfig(interaction.guildId, selectedPanelId);
            if (!panelConfig) {
                return interaction.reply({ 
                    content: '❌ O painel selecionado não existe mais! Use `/selecionar_painel`.', 
                    ephemeral: true 
                });
            }

            // ========== COMANDOS DE CONFIGURAÇÃO (aplicados ao painel selecionado) ==========

            if (interaction.commandName === 'setup') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ 
                        content: '❌ Você precisa ser um administrador!', 
                        ephemeral: true 
                    });
                }

                const cargo = interaction.options.getRole('cargo');
                const categoria = interaction.options.getChannel('categoria');

                panelConfig.supportRoleId = cargo.id;
                panelConfig.categoryId = categoria.id;
                if (!panelConfig.supportRoles) {
                    panelConfig.supportRoles = [cargo.id];
                } else if (!panelConfig.supportRoles.includes(cargo.id)) {
                    panelConfig.supportRoles.push(cargo.id);
                }
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle('✅ Configuração Concluída!')
                    .setDescription(`**Painel "${panelConfig.name}" configurado com sucesso!**\n\n📌 **Cargo de Suporte:** ${cargo}\n📁 **Categoria:** ${categoria.name}`)
                    .setColor(0x00FF00)
                    .setFooter({ text: 'Powered by STG Store' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === 'logs') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ 
                        content: '❌ Você precisa ser um administrador!', 
                        ephemeral: true 
                    });
                }

                const canal = interaction.options.getChannel('canal');
                panelConfig.logsChannelId = canal.id;
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle('✅ Canal de Logs Configurado!')
                    .setDescription(`**Canal de logs do painel "${panelConfig.name}" configurado!**\n\n📋 **Canal de Logs:** ${canal}`)
                    .setColor(0x00FF00)
                    .setFooter({ text: 'Powered by STG Store' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === 'add_cargo') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ Você precisa ser um administrador!', ephemeral: true });
                }

                const cargo = interaction.options.getRole('cargo');
                
                if (!panelConfig.supportRoles) {
                    panelConfig.supportRoles = [];
                }

                if (panelConfig.supportRoles.includes(cargo.id)) {
                    return interaction.reply({ content: '❌ Este cargo já está configurado!', ephemeral: true });
                }

                panelConfig.supportRoles.push(cargo.id);
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle('✅ Cargo Adicionado!')
                    .setDescription(`**Cargo adicionado ao painel "${panelConfig.name}"!**\n\n📌 **Cargo:** ${cargo}`)
                    .setColor(0x00FF00)
                    .setFooter({ text: 'Powered by STG Store' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === 'remove_cargo') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ Você precisa ser um administrador!', ephemeral: true });
                }

                const cargo = interaction.options.getRole('cargo');
                
                if (!panelConfig.supportRoles) {
                    return interaction.reply({ content: '❌ Nenhum cargo configurado ainda!', ephemeral: true });
                }

                const index = panelConfig.supportRoles.indexOf(cargo.id);
                if (index === -1) {
                    return interaction.reply({ content: '❌ Este cargo não está na lista!', ephemeral: true });
                }

                panelConfig.supportRoles.splice(index, 1);
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle('🗑️ Cargo Removido!')
                    .setDescription(`**Cargo removido do painel "${panelConfig.name}"!**\n\n📌 **Cargo:** ${cargo}`)
                    .setColor(0xFF6B6B)
                    .setFooter({ text: 'Powered by STG Store' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === 'list_cargos') {
                if (!panelConfig.supportRoles || panelConfig.supportRoles.length === 0) {
                    return interaction.reply({ content: '❌ Nenhum cargo de suporte configurado!', ephemeral: true });
                }

                const cargos = panelConfig.supportRoles.map(roleId => {
                    const role = interaction.guild.roles.cache.get(roleId);
                    return role ? `• ${role}` : `• ID: ${roleId} (cargo não encontrado)`;
                }).join('\n');

                const embed = new EmbedBuilder()
                    .setTitle(`📋 Cargos - ${panelConfig.name}`)
                    .setDescription(cargos)
                    .setColor(0x0099FF)
                    .setFooter({ text: 'Powered by STG Store' })
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

                if (!panelConfig.customButtons) {
                    panelConfig.customButtons = [];
                }

                if (panelConfig.customButtons.some(btn => btn.label === label)) {
                    return interaction.reply({ content: '❌ Já existe um botão com esse label!', ephemeral: true });
                }

                panelConfig.customButtons.push({ label, emoji, style: cor });
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle('✅ Botão Adicionado!')
                    .setDescription(`**Botão adicionado ao painel "${panelConfig.name}"!**\n\n🏷️ **Label:** ${label}\n${emoji ? `😀 **Emoji:** ${emoji}\n` : ''}🎨 **Cor:** ${cor}`)
                    .setColor(0x00FF00)
                    .setFooter({ text: 'Powered by STG Store' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === 'remove_button') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ Você precisa ser um administrador!', ephemeral: true });
                }

                const label = interaction.options.getString('label');
                
                if (!panelConfig.customButtons) {
                    return interaction.reply({ content: '❌ Nenhum botão configurado ainda!', ephemeral: true });
                }

                const index = panelConfig.customButtons.findIndex(btn => btn.label === label);
                if (index === -1) {
                    return interaction.reply({ content: '❌ Botão não encontrado!', ephemeral: true });
                }

                panelConfig.customButtons.splice(index, 1);
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle('🗑️ Botão Removido!')
                    .setDescription(`**Botão removido do painel "${panelConfig.name}"!**\n\n🏷️ **Label:** ${label}`)
                    .setColor(0xFF6B6B)
                    .setFooter({ text: 'Powered by STG Store' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === 'list_buttons') {
                if (!panelConfig.customButtons || panelConfig.customButtons.length === 0) {
                    return interaction.reply({ content: '❌ Nenhum botão personalizado configurado!', ephemeral: true });
                }

                const botoes = panelConfig.customButtons.map((btn, i) => 
                    `${i + 1}. **${btn.label}** ${btn.emoji || ''} - Cor: ${btn.style}`
                ).join('\n');

                const embed = new EmbedBuilder()
                    .setTitle(`🔘 Botões - ${panelConfig.name}`)
                    .setDescription(botoes)
                    .setColor(0x0099FF)
                    .setFooter({ text: 'Powered by STG Store' })
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

                if (!panelConfig.setores) {
                    panelConfig.setores = [];
                }

                if (panelConfig.setores.some(s => s.nome === nome)) {
                    return interaction.reply({ content: '❌ Já existe um setor com esse nome!', ephemeral: true });
                }

                panelConfig.setores.push({ nome, descricao, emoji });
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle('✅ Setor Adicionado!')
                    .setDescription(`**Setor adicionado ao painel "${panelConfig.name}"!**\n\n📌 **Nome:** ${nome}\n📝 **Descrição:** ${descricao}${emoji ? `\n😀 **Emoji:** ${emoji}` : ''}`)
                    .setColor(0x00FF00)
                    .setFooter({ text: 'Powered by STG Store' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === 'remove_setor') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ Você precisa ser um administrador!', ephemeral: true });
                }

                const nome = interaction.options.getString('nome');
                
                if (!panelConfig.setores) {
                    return interaction.reply({ content: '❌ Nenhum setor configurado ainda!', ephemeral: true });
                }

                const index = panelConfig.setores.findIndex(s => s.nome === nome);
                if (index === -1) {
                    return interaction.reply({ content: '❌ Setor não encontrado!', ephemeral: true });
                }

                panelConfig.setores.splice(index, 1);
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle('🗑️ Setor Removido!')
                    .setDescription(`**Setor removido do painel "${panelConfig.name}"!**\n\n📌 **Nome:** ${nome}`)
                    .setColor(0xFF6B6B)
                    .setFooter({ text: 'Powered by STG Store' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === 'list_setores') {
                if (!panelConfig.setores || panelConfig.setores.length === 0) {
                    return interaction.reply({ content: '❌ Nenhum setor configurado ainda!', ephemeral: true });
                }

                const setores = panelConfig.setores.map((s, i) => 
                    `${i + 1}. ${s.emoji || '📌'} **${s.nome}** - ${s.descricao}`
                ).join('\n');

                const embed = new EmbedBuilder()
                    .setTitle(`📂 Setores - ${panelConfig.name}`)
                    .setDescription(setores)
                    .setColor(0x0099FF)
                    .setFooter({ text: 'Powered by STG Store' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // ========== COMANDOS DE PERSONALIZAÇÃO ==========

            if (interaction.commandName === 'edit_titulo') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ Você precisa ser um administrador!', ephemeral: true });
                }

                const titulo = interaction.options.getString('titulo');
                
                if (!panelConfig.customization) {
                    panelConfig.customization = {};
                }
                
                panelConfig.customization.title = titulo;
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle('✅ Título Atualizado!')
                    .setDescription(`**Novo título do painel "${panelConfig.name}":**\n\n${titulo}`)
                    .setColor(0x00FF00)
                    .setFooter({ text: 'Powered by STG Store' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === 'edit_descricao') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ Você precisa ser um administrador!', ephemeral: true });
                }

                const descricao = interaction.options.getString('descricao');
                
                if (!panelConfig.customization) {
                    panelConfig.customization = {};
                }
                
                panelConfig.customization.description = descricao;
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle('✅ Descrição Atualizada!')
                    .setDescription(`**Nova descrição configurada para o painel "${panelConfig.name}"!**`)
                    .setColor(0x00FF00)
                    .setFooter({ text: 'Powered by STG Store' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === 'edit_imagem') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ Você precisa ser um administrador!', ephemeral: true });
                }

                const url = interaction.options.getString('url');
                
                if (!panelConfig.customization) {
                    panelConfig.customization = {};
                }
                
                if (url) {
                    panelConfig.customization.image = url;
                } else {
                    delete panelConfig.customization.image;
                }
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle(url ? '✅ Imagem Atualizada!' : '🗑️ Imagem Removida!')
                    .setDescription(url ? 
                        `**Imagem do painel "${panelConfig.name}" atualizada!**\n\n📷 URL: ${url}` :
                        `**Imagem removida do painel "${panelConfig.name}".**`)
                    .setColor(url ? 0x00FF00 : 0xFF6B6B)
                    .setFooter({ text: 'Powered by STG Store' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === 'edit_thumbnail') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ Você precisa ser um administrador!', ephemeral: true });
                }

                const url = interaction.options.getString('url');
                
                if (!panelConfig.customization) {
                    panelConfig.customization = {};
                }
                
                if (url) {
                    panelConfig.customization.thumbnail = url;
                } else {
                    delete panelConfig.customization.thumbnail;
                }
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle(url ? '✅ Thumbnail Atualizada!' : '🗑️ Thumbnail Removida!')
                    .setDescription(url ? 
                        `**Thumbnail do painel "${panelConfig.name}" atualizada!**\n\n📷 URL: ${url}` :
                        `**Thumbnail removida do painel "${panelConfig.name}".**`)
                    .setColor(url ? 0x00FF00 : 0xFF6B6B)
                    .setFooter({ text: 'Powered by STG Store' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === 'edit_footer') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ Você precisa ser um administrador!', ephemeral: true });
                }

                const texto = interaction.options.getString('texto');
                
                if (!panelConfig.customization) {
                    panelConfig.customization = {};
                }
                
                if (texto) {
                    panelConfig.customization.footer = texto;
                } else {
                    delete panelConfig.customization.footer;
                }
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle(texto ? '✅ Rodapé Atualizado!' : '🗑️ Rodapé Removido!')
                    .setDescription(texto ? 
                        `**Rodapé do painel "${panelConfig.name}" atualizado!**\n\n📝 Texto: ${texto}` :
                        `**Rodapé removido do painel "${panelConfig.name}".**`)
                    .setColor(texto ? 0x00FF00 : 0xFF6B6B)
                    .setFooter({ text: 'Powered by STG Store' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === 'edit_color') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ Você precisa ser um administrador!', ephemeral: true });
                }

                let cor = interaction.options.getString('cor');
                
                // Converter hex para número
                let colorValue;
                if (cor.startsWith('#')) {
                    colorValue = parseInt(cor.substring(1), 16);
                } else if (cor.startsWith('0x')) {
                    colorValue = parseInt(cor, 16);
                } else {
                    // Cores nomeadas comuns
                    const namedColors = {
                        'vermelho': 0xFF0000, 'red': 0xFF0000,
                        'verde': 0x00FF00, 'green': 0x00FF00,
                        'azul': 0x0099FF, 'blue': 0x0099FF,
                        'amarelo': 0xFFFF00, 'yellow': 0xFFFF00,
                        'roxo': 0x9B59B6, 'purple': 0x9B59B6,
                        'laranja': 0xFF9900, 'orange': 0xFF9900,
                        'rosa': 0xFF69B4, 'pink': 0xFF69B4,
                        'preto': 0x000000, 'black': 0x000000,
                        'branco': 0xFFFFFF, 'white': 0xFFFFFF,
                        'cinza': 0x808080, 'gray': 0x808080
                    };
                    colorValue = namedColors[cor.toLowerCase()];
                }

                if (colorValue === undefined || isNaN(colorValue)) {
                    return interaction.reply({ 
                        content: '❌ Cor inválida! Use formato hexadecimal (#0099FF ou 0x0099FF) ou nome de cor (vermelho, verde, azul, etc).', 
                        ephemeral: true 
                    });
                }
                
                if (!panelConfig.customization) {
                    panelConfig.customization = {};
                }
                
                panelConfig.customization.color = colorValue;
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle('✅ Cor Atualizada!')
                    .setDescription(`**Cor da borda do painel "${panelConfig.name}" atualizada!**`)
                    .setColor(colorValue)
                    .setFooter({ text: 'Powered by STG Store' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === 'ver_personalizacao') {
                const custom = panelConfig.customization || {};
                const tipoTexto = panelConfig.type === 'buttons' ? 'Botões' : 'Select Menu';
                
                const info = [
                    `**Painel:** ${panelConfig.name}`,
                    '',
                    `🎛️ **Tipo:** ${tipoTexto}`,
                    `📝 **Título:** ${custom.title || 'Padrão'}`,
                    `📄 **Descrição:** ${custom.description ? 'Personalizada ✓' : 'Padrão'}`,
                    `🎨 **Cor:** ${custom.color !== undefined ? `#${custom.color.toString(16).padStart(6, '0').toUpperCase()}` : 'Padrão (#0099FF)'}`,
                    `🖼️ **Imagem:** ${custom.image || 'Padrão'}`,
                    `🖼️ **Thumbnail:** ${custom.thumbnail || 'Nenhuma'}`,
                    `📌 **Rodapé:** ${custom.footer || 'Padrão (Powered by STG Store)'}`
                ].join('\n');

                const embed = new EmbedBuilder()
                    .setTitle('🎨 Personalização do Painel')
                    .setDescription(info)
                    .setColor(custom.color || 0x0099FF)
                    .setFooter({ text: 'Powered by STG Store' })
                    .setTimestamp();

                if (custom.thumbnail) {
                    embed.setThumbnail(custom.thumbnail);
                }

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === 'set_tipo_painel') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ Você precisa ser um administrador!', ephemeral: true });
                }

                const tipo = interaction.options.getString('tipo');
                panelConfig.type = tipo;
                saveConfig();

                const tipoTexto = tipo === 'select_menu' ? 'Select Menu (Dropdown)' : 'Botões';
                const embed = new EmbedBuilder()
                    .setTitle('✅ Tipo de Painel Atualizado!')
                    .setDescription(`**O painel "${panelConfig.name}" agora usa:** ${tipoTexto}\n\n${tipo === 'buttons' ? '💡 Use \`/add_button\` para adicionar botões personalizados!' : '💡 Use \`/add_setor\` para adicionar opções ao menu!'}`)
                    .setColor(0x00FF00)
                    .setFooter({ text: 'Powered by STG Store' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }

        // ========== COMANDOS DE TICKET (não requerem painel selecionado) ==========

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
                    .setFooter({ text: 'Powered by STG Store' })
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
                    .setFooter({ text: 'Powered by STG Store' })
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

    // ========== INTERAÇÕES COM BOTÕES ==========

    if (interaction.isButton()) {
        
        // Tratamento para botões personalizados de criação de ticket
        if (interaction.customId.startsWith('create_ticket:')) {
            const parts = interaction.customId.split(':');
            const panelId = parts[1];
            const buttonLabel = parts.slice(2).join(':');
            
            const panelConfig = getPanelConfig(interaction.guildId, panelId);

            if (!panelConfig || !panelConfig.categoryId) {
                return interaction.reply({ 
                    content: '❌ Este painel não está configurado corretamente! Peça a um administrador para usar `/selecionar_painel` e `/setup`.', 
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
                content: `🎫 Criando seu ticket: **${buttonLabel}**...`, 
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

                if (panelConfig.supportRoles && panelConfig.supportRoles.length > 0) {
                    panelConfig.supportRoles.forEach(roleId => {
                        permissionOverwrites.push({
                            id: roleId,
                            allow: [
                                PermissionFlagsBits.ViewChannel, 
                                PermissionFlagsBits.SendMessages, 
                                PermissionFlagsBits.ReadMessageHistory
                            ]
                        });
                    });
                } else if (panelConfig.supportRoleId) {
                    permissionOverwrites.push({
                        id: panelConfig.supportRoleId,
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
                    parent: panelConfig.categoryId,
                    permissionOverwrites: permissionOverwrites
                });

                const ticketEmbed = new EmbedBuilder()
                    .setTitle('🎫 Ticket Aberto')
                    .setDescription(`Olá ${interaction.user}, bem-vindo ao seu ticket!\n\n**Painel:** ${panelConfig.name}\n**Setor selecionado:** ${buttonLabel}\n\nUm membro da equipe de suporte irá atendê-lo em breve.\n\n**Para fechar ou reivindicar este ticket, clique nos botões abaixo.**`)
                    .setColor(0x00FF00)
                    .setFooter({ text: 'Powered by STG Store' })
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

                const mentionRoles = panelConfig.supportRoles && panelConfig.supportRoles.length > 0
                    ? panelConfig.supportRoles.map(roleId => `<@&${roleId}>`).join(' ')
                    : (panelConfig.supportRoleId ? `<@&${panelConfig.supportRoleId}>` : '');

                await ticketChannel.send({ 
                    content: `${interaction.user}${mentionRoles ? ' | ' + mentionRoles : ''}`, 
                    embeds: [ticketEmbed], 
                    components: [row] 
                });

                await interaction.followUp({ 
                    content: `✅ Ticket criado com sucesso! ${ticketChannel}`, 
                    ephemeral: true 
                });

                console.log(`✅ Ticket criado: ${ticketChannelName} por ${interaction.user.tag} - Painel: ${panelConfig.name} - Botão: ${buttonLabel}`);

                if (panelConfig.logsChannelId) {
                    const logsChannel = interaction.guild.channels.cache.get(panelConfig.logsChannelId);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('📂 Ticket Aberto')
                            .setDescription(`**Usuário:** ${interaction.user} (${interaction.user.tag})\n**ID:** ${interaction.user.id}\n**Painel:** ${panelConfig.name}\n**Categoria:** ${buttonLabel}\n**Canal:** ${ticketChannel}\n**Horário:** <t:${Math.floor(Date.now() / 1000)}:F>`)
                            .setColor(0x00FF00)
                            .setFooter({ text: 'Powered by STG Store' })
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

            // Verificar se o usuário tem algum cargo de suporte configurado em algum painel
            let hasSupport = false;
            const guildConfig = config[interaction.guildId];
            if (guildConfig?.panels) {
                for (const panel of Object.values(guildConfig.panels)) {
                    if (panel.supportRoles) {
                        for (const roleId of panel.supportRoles) {
                            if (interaction.member.roles.cache.has(roleId)) {
                                hasSupport = true;
                                break;
                            }
                        }
                    }
                    if (hasSupport) break;
                }
            }

            if (!hasSupport) {
                return interaction.reply({ 
                    content: '❌ Apenas membros da equipe de suporte podem reivindicar tickets!', 
                    ephemeral: true 
                });
            }

            const claimEmbed = new EmbedBuilder()
                .setTitle('✋ Ticket Reivindicado')
                .setDescription(`Este ticket foi reivindicado por ${interaction.user}.\n\nEle será responsável pelo atendimento.`)
                .setColor(0xFFD700)
                .setFooter({ text: 'Powered by STG Store' })
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
                .setFooter({ text: 'Powered by STG Store' })
                .setTimestamp();

            await interaction.reply({ embeds: [closeEmbed] });

            console.log(`🔒 Ticket fechado: ${channel.name} por ${interaction.user.tag}`);

            // Enviar log para todos os painéis que tiverem logs configurados
            const guildConfig = config[interaction.guildId];
            if (guildConfig?.panels) {
                for (const panel of Object.values(guildConfig.panels)) {
                    if (panel.logsChannelId) {
                        const logsChannel = interaction.guild.channels.cache.get(panel.logsChannelId);
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
                                .setFooter({ text: 'Powered by STG Store' })
                                .setTimestamp();
                            
                            await logsChannel.send({ embeds: [logEmbed] }).catch(err => {
                                console.error('❌ Erro ao enviar log de ticket fechado:', err);
                            });
                        }
                    }
                }
            }

            setTimeout(() => {
                channel.delete().catch(err => {
                    console.error('❌ Erro ao deletar canal:', err);
                });
            }, 5000);
        }
    }

    // ========== INTERAÇÕES COM SELECT MENU ==========

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('select_setor:')) {
            const panelId = interaction.customId.split(':')[1];
            const panelConfig = getPanelConfig(interaction.guildId, panelId);

            if (!panelConfig || !panelConfig.supportRoleId || !panelConfig.categoryId) {
                return interaction.reply({ 
                    content: '❌ Este painel não está configurado corretamente! Peça a um administrador para usar `/selecionar_painel` e `/setup`.', 
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

                if (panelConfig.supportRoles && panelConfig.supportRoles.length > 0) {
                    panelConfig.supportRoles.forEach(roleId => {
                        permissionOverwrites.push({
                            id: roleId,
                            allow: [
                                PermissionFlagsBits.ViewChannel, 
                                PermissionFlagsBits.SendMessages, 
                                PermissionFlagsBits.ReadMessageHistory
                            ]
                        });
                    });
                } else if (panelConfig.supportRoleId) {
                    permissionOverwrites.push({
                        id: panelConfig.supportRoleId,
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
                    parent: panelConfig.categoryId,
                    permissionOverwrites: permissionOverwrites
                });

                const ticketEmbed = new EmbedBuilder()
                    .setTitle('🎫 Ticket Aberto')
                    .setDescription(`Olá ${interaction.user}, bem-vindo ao seu ticket!\n\n**Painel:** ${panelConfig.name}\n**Setor selecionado:** ${setorSelecionado}\n\nUm membro da equipe de suporte irá atendê-lo em breve.\n\n**Para fechar ou reivindicar este ticket, clique nos botões abaixo.**`)
                    .setColor(0x00FF00)
                    .setFooter({ text: 'Powered by STG Store' })
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

                const mentionRoles = panelConfig.supportRoles && panelConfig.supportRoles.length > 0
                    ? panelConfig.supportRoles.map(roleId => `<@&${roleId}>`).join(' ')
                    : `<@&${panelConfig.supportRoleId}>`;

                await ticketChannel.send({ 
                    content: `${interaction.user} | ${mentionRoles}`,
                    embeds: [ticketEmbed], 
                    components: [row] 
                });

                console.log(`✅ Ticket criado: ${ticketChannelName} por ${interaction.user.tag} - Painel: ${panelConfig.name} - Setor: ${setorSelecionado}`);

                if (panelConfig.logsChannelId) {
                    const logsChannel = interaction.guild.channels.cache.get(panelConfig.logsChannelId);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('📂 Ticket Aberto')
                            .setDescription(`**Usuário:** ${interaction.user} (${interaction.user.tag})\n**ID:** ${interaction.user.id}\n**Painel:** ${panelConfig.name}\n**Setor:** ${setorSelecionado}\n**Canal:** ${ticketChannel}\n**Horário:** <t:${Math.floor(Date.now() / 1000)}:F>`)
                            .setColor(0x00FF00)
                            .setFooter({ text: 'Powered by STG Store' })
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

// ========== SERVIDOR WEB ==========

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
                    <h1>🤖 Discord Ticket Bot - Multi-Painel</h1>
                    <div class="status">✅ Sistema Online!</div>
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
