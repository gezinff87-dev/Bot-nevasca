require("dotenv").config();
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    PermissionFlagsBits,
    ChannelType,
    REST,
    Routes,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder,
} = require("discord.js");
const express = require("express");
const fs = require("fs");
const path = require("path");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const CONFIG_FILE = path.join(__dirname, "config.json");
let config = {};

const userPanelContext = new Map();
const ticketClaimedBy = new Map();
const ticketMetadata = new Map();

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, "utf-8");
            config = JSON.parse(data);

            Object.keys(config).forEach((guildId) => {
                if (!config[guildId].panels) {
                    console.log(
                        `🔄 Migrando configuração antiga para ${guildId}...`,
                    );
                    const oldConfig = { ...config[guildId] };
                    config[guildId] = {
                        panels: {
                            default: {
                                name: "Painel Padrão",
                                ...oldConfig,
                            },
                        },
                    };
                }
            });

            console.log("✅ Configurações carregadas com sucesso!");
        } else {
            config = {};
            saveConfig();
            console.log("📝 Arquivo config.json criado.");
        }
    } catch (error) {
        console.error("❌ Erro ao carregar config.json:", error);
        config = {};
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 4), "utf-8");
    } catch (error) {
        console.error("❌ Erro ao salvar config.json:", error);
    }
}

function sanitizeUsername(username) {
    return username
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .substring(0, 40);
}

function sanitizePanelId(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .substring(0, 32);
}

function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
        return false;
    }
}

function isValidEmoji(emoji) {
    if (!emoji) return true;

    const customEmojiRegex = /<a?:\w+:\d+>/;
    if (customEmojiRegex.test(emoji)) {
        return true;
    }

    const emojiRegex =
        /^[\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\p{Emoji_Modifier}\p{Emoji_Component}]+$/u;
    if (emojiRegex.test(emoji)) {
        return true;
    }

    return false;
}

function parseEmoji(emoji) {
    if (!emoji) return null;

    const customEmojiRegex = /<(a)?:(\w+):(\d+)>/;
    const match = emoji.match(customEmojiRegex);

    if (match) {
        return {
            id: match[3],
            name: match[2],
            animated: !!match[1],
        };
    }

    return emoji;
}

function validateButtonLabel(label) {
    if (!label || label.trim().length === 0) {
        return { valid: false, error: "O label não pode estar vazio!" };
    }
    if (label.length > 80) {
        return {
            valid: false,
            error: "O label do botão não pode ter mais de 80 caracteres!",
        };
    }
    return { valid: true };
}

function validateCustomId(customId) {
    if (!customId || customId.trim().length === 0) {
        return {
            valid: false,
            error: "O ID personalizado não pode estar vazio!",
        };
    }
    if (customId.length > 100) {
        return {
            valid: false,
            error: "O ID personalizado não pode ter mais de 100 caracteres!",
        };
    }
    return { valid: true };
}

function buildTicketControls() {
    const closeButton = new ButtonBuilder()
        .setCustomId("fechar_ticket")
        .setLabel("Fechar")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger);

    const claimButton = new ButtonBuilder()
        .setCustomId("reivindicar_ticket")
        .setLabel("Reivindicar")
        .setEmoji("🙋")
        .setStyle(ButtonStyle.Secondary);

    const archiveButton = new ButtonBuilder()
        .setCustomId("arquivar_ticket")
        .setLabel("Arquivar Ticket")
        .setEmoji("📁")
        .setStyle(ButtonStyle.Secondary);

    const settingsButton = new ButtonBuilder()
        .setCustomId("ticket_settings")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Secondary);

    return new ActionRowBuilder().addComponents(
        closeButton,
        claimButton,
        archiveButton,
        settingsButton,
    );
}

function getTicketContext(channelId) {
    return ticketMetadata.get(channelId) || null;
}

function validateSelectMenuOption(label, value, description) {
    if (!label || label.trim().length === 0) {
        return { valid: false, error: "O nome do setor não pode estar vazio!" };
    }
    if (!value || value.trim().length === 0) {
        return {
            valid: false,
            error: "O valor do setor não pode estar vazio!",
        };
    }
    if (!description || description.trim().length === 0) {
        return {
            valid: false,
            error: "A descrição do setor não pode estar vazia!",
        };
    }

    if (label.length > 100) {
        return {
            valid: false,
            error: "O nome do setor não pode ter mais de 100 caracteres!",
        };
    }
    if (value.length > 100) {
        return {
            valid: false,
            error: "O valor do setor não pode ter mais de 100 caracteres!",
        };
    }
    if (description.length > 100) {
        return {
            valid: false,
            error: "A descrição do setor não pode ter mais de 100 caracteres!",
        };
    }

    return { valid: true };
}

function createSafeCustomId(panelId, label) {
    const maxPrefixLength = 100 - panelId.length - 15 - 2;
    const safeLabelPart = label.substring(0, maxPrefixLength);
    return `create_ticket:${panelId}:${safeLabelPart}`;
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

async function generateTranscript(channel) {
    try {
        let messages = [];
        let lastId;

        while (true) {
            const options = { limit: 100 };
            if (lastId) {
                options.before = lastId;
            }

            const fetchedMessages = await channel.messages.fetch(options);
            if (fetchedMessages.size === 0) break;

            messages.push(...fetchedMessages.values());
            lastId = fetchedMessages.last().id;

            if (fetchedMessages.size < 100) break;
        }

        messages = messages.reverse();

        let transcript = `═══════════════════════════════════════\n`;
        transcript += `📋 TRANSCRIÇÃO DO TICKET\n`;
        transcript += `═══════════════════════════════════════\n`;
        transcript += `Canal: #${channel.name}\n`;
        transcript += `Servidor: ${channel.guild.name}\n`;
        transcript += `Data: ${new Date().toLocaleString('pt-BR')}\n`;
        transcript += `Total de Mensagens: ${messages.length}\n`;
        transcript += `═══════════════════════════════════════\n\n`;

        for (const message of messages) {
            const timestamp = message.createdAt.toLocaleString('pt-BR');
            const author = message.author.tag;
            const content = message.content || '[Sem conteúdo de texto]';
            
            transcript += `[${timestamp}] ${author}:\n`;
            transcript += `${content}\n`;
            
            if (message.attachments.size > 0) {
                transcript += `📎 Anexos: ${message.attachments.map(a => a.url).join(', ')}\n`;
            }
            
            if (message.embeds.length > 0) {
                transcript += `📊 Embeds: ${message.embeds.length} embed(s)\n`;
            }
            
            transcript += `\n`;
        }

        transcript += `═══════════════════════════════════════\n`;
        transcript += `Fim da transcrição\n`;
        transcript += `═══════════════════════════════════════\n`;

        return transcript;
    } catch (error) {
        console.error("❌ Erro ao gerar transcrição:", error);
        return null;
    }
}

function checkEnvironmentVariables() {
    const requiredVars = ["TOKEN", "CLIENT_ID"];
    const missing = requiredVars.filter((varName) => !process.env[varName]);

    if (missing.length > 0) {
        console.error("❌ ERRO: Variáveis de ambiente ausentes!");
        console.error(`   Faltam: ${missing.join(", ")}`);
        console.error(
            "   Por favor, crie um arquivo .env com TOKEN e CLIENT_ID",
        );
        return false;
    }

    return true;
}

const commands = [
    {
        name: "criar_painel",
        description: "Cria um novo painel de tickets",
        options: [
            {
                name: "nome",
                description: "Nome do painel (ex: Suporte, Vendas, VIP)",
                type: 3,
                required: true,
            },
            {
                name: "tipo",
                description: "Tipo de interface do painel",
                type: 3,
                required: false,
                choices: [
                    {
                        name: "Select Menu (Menu Dropdown)",
                        value: "select_menu",
                    },
                    { name: "Botões", value: "buttons" },
                ],
            },
        ],
    },
    {
        name: "listar_paineis",
        description: "Lista todos os painéis de tickets configurados",
    },
    {
        name: "selecionar_painel",
        description: "Seleciona qual painel deseja editar",
        options: [
            {
                name: "painel",
                description: "ID do painel a selecionar",
                type: 3,
                required: true,
            },
        ],
    },
    {
        name: "enviar_painel",
        description: "Envia um painel de tickets no canal atual",
        options: [
            {
                name: "painel",
                description: "ID do painel a enviar",
                type: 3,
                required: true,
            },
        ],
    },
    {
        name: "deletar_painel",
        description: "Deleta um painel de tickets",
        options: [
            {
                name: "painel",
                description: "ID do painel a deletar",
                type: 3,
                required: true,
            },
        ],
    },
    {
        name: "setup",
        description:
            "Configura o painel selecionado (cargo de suporte e categoria)",
        options: [
            {
                name: "cargo",
                description: "Cargo que terá acesso aos tickets",
                type: 8,
                required: true,
            },
            {
                name: "categoria",
                description: "Categoria onde os tickets serão criados",
                type: 7,
                required: true,
                channel_types: [ChannelType.GuildCategory],
            },
        ],
    },
    {
        name: "adduser",
        description: "Adiciona um usuário ao ticket atual",
        options: [
            {
                name: "usuario",
                description: "Usuário a ser adicionado ao ticket",
                type: 6,
                required: true,
            },
        ],
    },
    {
        name: "remove_user",
        description: "Remove um usuário do ticket atual",
        options: [
            {
                name: "usuario",
                description: "Usuário a ser removido do ticket",
                type: 6,
                required: true,
            },
        ],
    },
    {
        name: "logs",
        description: "Configura o canal de logs do painel selecionado",
        options: [
            {
                name: "canal",
                description: "Canal onde os logs serão enviados",
                type: 7,
                required: true,
                channel_types: [ChannelType.GuildText],
            },
        ],
    },
    {
        name: "add_cargo",
        description: "Adiciona um cargo de suporte ao painel selecionado",
        options: [
            {
                name: "cargo",
                description: "Cargo que terá acesso aos tickets",
                type: 8,
                required: true,
            },
        ],
    },
    {
        name: "remove_cargo",
        description: "Remove um cargo de suporte do painel selecionado",
        options: [
            {
                name: "cargo",
                description: "Cargo a ser removido",
                type: 8,
                required: true,
            },
        ],
    },
    {
        name: "list_cargos",
        description: "Lista todos os cargos de suporte do painel selecionado",
    },
    {
        name: "add_button",
        description: "Adiciona um botão personalizado ao painel selecionado",
        options: [
            {
                name: "label",
                description: "Texto que aparece no botão",
                type: 3,
                required: true,
            },
            {
                name: "emoji",
                description: "Emoji do botão (ex: 🎫 ou <:nome:id>)",
                type: 3,
                required: false,
            },
            {
                name: "cor",
                description: "Cor do botão",
                type: 3,
                required: false,
                choices: [
                    { name: "Azul", value: "Primary" },
                    { name: "Cinza", value: "Secondary" },
                    { name: "Verde", value: "Success" },
                    { name: "Vermelho", value: "Danger" },
                ],
            },
        ],
    },
    {
        name: "remove_button",
        description: "Remove um botão do painel selecionado",
        options: [
            {
                name: "label",
                description: "Label do botão a ser removido",
                type: 3,
                required: true,
            },
        ],
    },
    {
        name: "list_buttons",
        description: "Lista todos os botões do painel selecionado",
    },
    {
        name: "add_setor",
        description: "Adiciona um setor ao painel selecionado",
        options: [
            {
                name: "nome",
                description: "Nome do setor (ex: Suporte, Vendas, Financeiro)",
                type: 3,
                required: true,
            },
            {
                name: "descricao",
                description: "Descrição do setor",
                type: 3,
                required: true,
            },
            {
                name: "emoji",
                description: "Emoji do setor",
                type: 3,
                required: false,
            },
        ],
    },
    {
        name: "remove_setor",
        description: "Remove um setor do painel selecionado",
        options: [
            {
                name: "nome",
                description: "Nome do setor a ser removido",
                type: 3,
                required: true,
            },
        ],
    },
    {
        name: "list_setores",
        description: "Lista todos os setores do painel selecionado",
    },
    {
        name: "edit_titulo",
        description:
            "Edita o título do painel selecionado (deixe vazio para remover)",
        options: [
            {
                name: "titulo",
                description: "Novo título do painel (deixe vazio para remover)",
                type: 3,
                required: false,
            },
        ],
    },
    {
        name: "edit_descricao",
        description:
            "Edita a descrição do painel selecionado (deixe vazio para remover)",
        options: [
            {
                name: "descricao",
                description:
                    "Nova descrição do painel (deixe vazio para remover)",
                type: 3,
                required: false,
            },
        ],
    },
    {
        name: "edit_imagem",
        description: "Edita a imagem (banner) do painel selecionado",
        options: [
            {
                name: "url",
                description: "URL da imagem (deixe vazio para remover)",
                type: 3,
                required: false,
            },
        ],
    },
    {
        name: "edit_thumbnail",
        description: "Edita a thumbnail (miniatura) do painel selecionado",
        options: [
            {
                name: "url",
                description: "URL da thumbnail (deixe vazio para remover)",
                type: 3,
                required: false,
            },
        ],
    },
    {
        name: "edit_footer",
        description: "Edita o rodapé do painel selecionado",
        options: [
            {
                name: "texto",
                description: "Texto do rodapé (deixe vazio para remover)",
                type: 3,
                required: false,
            },
        ],
    },
    {
        name: "edit_color",
        description: "Edita a cor da borda do embed do painel selecionado",
        options: [
            {
                name: "cor",
                description: "Cor em hexadecimal (ex: #0099FF) ou nome de cor",
                type: 3,
                required: true,
            },
        ],
    },
    {
        name: "ver_personalizacao",
        description:
            "Visualiza as configurações de personalização do painel selecionado",
    },
    {
        name: "set_tipo_painel",
        description:
            "Define o tipo de interface do painel (select menu ou botões)",
        options: [
            {
                name: "tipo",
                description: "Tipo de interface",
                type: 3,
                required: true,
                choices: [
                    {
                        name: "Select Menu (Menu Dropdown)",
                        value: "select_menu",
                    },
                    { name: "Botões", value: "buttons" },
                ],
            },
        ],
    },
];

async function registerCommands() {
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

    try {
        console.log("🔄 Registrando comandos slash...");

        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
            body: commands,
        });

        console.log("✅ Comandos registrados com sucesso!");
    } catch (error) {
        console.error("❌ Erro ao registrar comandos:", error);
    }
}

client.once("ready", () => {
    console.log(`🤖 Bot online como ${client.user.tag}`);
    console.log(`📊 Servidores: ${client.guilds.cache.size}`);

    loadConfig();
    registerCommands();

    client.user.setActivity("tickets | /criar_painel", { type: 3 });

    setInterval(
        () => {
            console.log(
                `⏰ [${new Date().toLocaleString("pt-BR")}] Bot ativo - ${client.guilds.cache.size} servidores`,
            );
        },
        5 * 60 * 1000,
    );
});

client.on("interactionCreate", async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "criar_painel") {
            if (
                !interaction.member.permissions.has(
                    PermissionFlagsBits.Administrator,
                )
            ) {
                return interaction.reply({
                    content:
                        "❌ Você precisa ser um administrador para usar este comando!",
                    ephemeral: true,
                });
            }

            const nome = interaction.options.getString("nome");
            const tipo = interaction.options.getString("tipo") || "select_menu";
            const panelId = sanitizePanelId(nome);

            if (!config[interaction.guildId]) {
                config[interaction.guildId] = { panels: {} };
            }
            if (!config[interaction.guildId].panels) {
                config[interaction.guildId].panels = {};
            }

            if (config[interaction.guildId].panels[panelId]) {
                return interaction.reply({
                    content: "❌ Já existe um painel com esse nome!",
                    ephemeral: true,
                });
            }

            config[interaction.guildId].panels[panelId] = {
                name: nome,
                type: tipo,
                setores: [],
                customButtons: [],
                supportRoles: [],
            };
            saveConfig();

            setSelectedPanel(interaction.user.id, interaction.guildId, panelId);

            const tipoTexto =
                tipo === "select_menu" ? "Select Menu (Dropdown)" : "Botões";
            const embed = new EmbedBuilder()
                .setTitle("✅ Painel Criado!")
                .setDescription(
                    `**Painel de tickets criado com sucesso!**\n\n📋 **Nome:** ${nome}\n🆔 **ID:** \`${panelId}\`\n🎛️ **Tipo:** ${tipoTexto}\n\n✨ Este painel foi automaticamente selecionado. Use \`/setup\` para configurá-lo.`,
                )
                .setColor(0x00ff00)
                .setFooter({ text: "Powered by 7M Store" })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (interaction.commandName === "listar_paineis") {
            const guildConfig = config[interaction.guildId];

            if (
                !guildConfig?.panels ||
                Object.keys(guildConfig.panels).length === 0
            ) {
                return interaction.reply({
                    content:
                        "❌ Nenhum painel configurado ainda! Use `/criar_painel` para criar um.",
                    ephemeral: true,
                });
            }

            const selectedPanelId = getSelectedPanel(
                interaction.user.id,
                interaction.guildId,
            );

            const paineis = Object.entries(guildConfig.panels)
                .map(([id, panel]) => {
                    const isSelected = id === selectedPanelId ? "✅ " : "";
                    const setoresCount = panel.setores?.length || 0;
                    const configured =
                        panel.categoryId && panel.supportRoleId ? "✓" : "⚠️";
                    return `${isSelected}**${panel.name}** ${configured}\n└ ID: \`${id}\` | Setores: ${setoresCount}`;
                })
                .join("\n\n");

            const embed = new EmbedBuilder()
                .setTitle("📋 Painéis de Tickets Configurados")
                .setDescription(
                    paineis +
                        "\n\n✅ = Selecionado | ✓ = Configurado | ⚠️ = Não configurado",
                )
                .setColor(0x0099ff)
                .setFooter({
                    text: "Use /selecionar_painel para escolher um painel",
                })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (interaction.commandName === "selecionar_painel") {
            const panelId = interaction.options.getString("painel");

            if (!config[interaction.guildId]?.panels?.[panelId]) {
                return interaction.reply({
                    content:
                        "❌ Painel não encontrado! Use `/listar_paineis` para ver os disponíveis.",
                    ephemeral: true,
                });
            }

            setSelectedPanel(interaction.user.id, interaction.guildId, panelId);
            const panel = config[interaction.guildId].panels[panelId];

            const embed = new EmbedBuilder()
                .setTitle("✅ Painel Selecionado!")
                .setDescription(
                    `Você agora está editando: **${panel.name}**\n\nTodos os comandos de configuração serão aplicados a este painel.`,
                )
                .setColor(0x00ff00)
                .setFooter({ text: "Powered by 7M Store" })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (interaction.commandName === "enviar_painel") {
            if (
                !interaction.member.permissions.has(
                    PermissionFlagsBits.ManageChannels,
                )
            ) {
                return interaction.reply({
                    content:
                        "❌ Você não tem permissão para usar este comando!",
                    ephemeral: true,
                });
            }

            const panelId = interaction.options.getString("painel");
            const panelConfig = getPanelConfig(interaction.guildId, panelId);

            if (!panelConfig) {
                return interaction.reply({
                    content: "❌ Painel não encontrado!",
                    ephemeral: true,
                });
            }

            const panelType = panelConfig.type || "select_menu";

            if (panelType === "select_menu") {
                if (!panelConfig.setores || panelConfig.setores.length === 0) {
                    return interaction.reply({
                        content:
                            "❌ Este painel não tem setores configurados! Use `/selecionar_painel` e depois `/add_setor`.",
                        ephemeral: true,
                    });
                }
            } else if (panelType === "buttons") {
                if (
                    !panelConfig.customButtons ||
                    panelConfig.customButtons.length === 0
                ) {
                    return interaction.reply({
                        content:
                            "❌ Este painel não tem botões configurados! Use `/selecionar_painel` e depois `/add_button`.",
                        ephemeral: true,
                    });
                }
            }

            const custom = panelConfig.customization || {};

            let embed;
            const components = [];

            if (panelType === "select_menu") {
                const defaultSelectAuthor = "Suporte";
                const defaultSelectAuthorIcon =
                    "https://i.postimg.cc/mkhf55vf/group-icon.png";
                const defaultSelectDescription =
                    "Está precisando de ajuda ou quer denunciar algum problema?\nEscolha a opção abaixo e aguarde a equipe de suporte!";
                const defaultSelectImage =
                    "https://i.postimg.cc/RFbMNyv3/standard-9.gif";

                embed = new EmbedBuilder()
                    .setColor(
                        custom.color !== undefined ? custom.color : 0xff0000,
                    )
                    .setTimestamp();

                const titleValue =
                    custom.title !== undefined
                        ? (custom.title || "").trim()
                        : defaultSelectAuthor;
                if (titleValue) {
                    embed.setAuthor({
                        name: titleValue,
                        iconURL: defaultSelectAuthorIcon,
                    });
                }

                const descValue =
                    custom.description !== undefined
                        ? (custom.description || "").trim()
                        : defaultSelectDescription;
                if (descValue) {
                    embed.setDescription(descValue);
                }

                const imageValue =
                    custom.image !== undefined
                        ? (custom.image || "").trim()
                        : defaultSelectImage;
                if (imageValue && isValidUrl(imageValue)) {
                    embed.setImage(imageValue);
                }

                const thumbnailValue = custom.thumbnail
                    ? custom.thumbnail.trim()
                    : "";
                if (thumbnailValue && isValidUrl(thumbnailValue)) {
                    embed.setThumbnail(thumbnailValue);
                }

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`select_setor:${panelId}`)
                    .setPlaceholder("Selecione o ticket desejado");

                panelConfig.setores.forEach((setor) => {
                    const option = new StringSelectMenuOptionBuilder()
                        .setLabel(setor.nome)
                        .setDescription(setor.descricao)
                        .setValue(setor.nome);

                    if (setor.emoji && isValidEmoji(setor.emoji)) {
                        const parsedEmoji = parseEmoji(setor.emoji);
                        if (typeof parsedEmoji === "string") {
                            option.setEmoji(parsedEmoji);
                        } else if (parsedEmoji && parsedEmoji.id) {
                            option.setEmoji(parsedEmoji);
                        }
                    }

                    selectMenu.addOptions(option);
                });

                components.push(
                    new ActionRowBuilder().addComponents(selectMenu),
                );
            } else {
                const defaultButtonTitle = `**${panelConfig.name}**`;
                const defaultButtonDescription =
                    "**Para que possamos iniciar o seu atendimento, selecione o setor desejado no menu abaixo.**\n\n" +
                    "**H͟o͟r͟á͟r͟i͟o͟ ͟d͟e͟ ͟A͟t͟e͟n͟d͟i͟m͟e͟n͟t͟o͟:**\n\n" +
                    "> Segunda a Sexta\n8:00h as 22:30h\n\n" +
                    "> Sábado e Domingo\n7:00h as 21:30h\n\n" +
                    "> **Caso envie mensagens fora do horário de atendimento, aguarde. Assim que um staff estiver disponível, irá lhe atender com o setor de atendimento selecionado. Por favor, evite menções e abrir ticket à toa sem precisar de suporte.**";
                const defaultButtonImage =
                    "https://i.postimg.cc/RFbMNyv3/standard-9.gif";
                const defaultButtonFooter = "Powered by 7M Store";

                embed = new EmbedBuilder()
                    .setColor(
                        custom.color !== undefined ? custom.color : 0x0099ff,
                    )
                    .setTimestamp();

                const titleValue =
                    custom.title !== undefined
                        ? (custom.title || "").trim()
                        : defaultButtonTitle;
                if (titleValue) {
                    embed.setTitle(titleValue);
                }

                const descValue =
                    custom.description !== undefined
                        ? (custom.description || "").trim()
                        : defaultButtonDescription;
                if (descValue) {
                    embed.setDescription(descValue);
                }

                const imageValue =
                    custom.image !== undefined
                        ? (custom.image || "").trim()
                        : defaultButtonImage;
                if (imageValue && isValidUrl(imageValue)) {
                    embed.setImage(imageValue);
                }

                const thumbnailValue = custom.thumbnail
                    ? custom.thumbnail.trim()
                    : "";
                if (thumbnailValue && isValidUrl(thumbnailValue)) {
                    embed.setThumbnail(thumbnailValue);
                }

                const footerValue =
                    custom.footer !== undefined
                        ? (custom.footer || "").trim()
                        : defaultButtonFooter;
                if (footerValue) {
                    embed.setFooter({ text: footerValue });
                }

                const buttons = [];
                panelConfig.customButtons.forEach((btn) => {
                    const button = new ButtonBuilder()
                        .setCustomId(createSafeCustomId(panelId, btn.label))
                        .setLabel(btn.label)
                        .setStyle(
                            ButtonStyle[btn.style] || ButtonStyle.Primary,
                        );

                    if (btn.emoji && isValidEmoji(btn.emoji)) {
                        const parsedEmoji = parseEmoji(btn.emoji);
                        if (typeof parsedEmoji === "string") {
                            button.setEmoji(parsedEmoji);
                        } else if (parsedEmoji && parsedEmoji.id) {
                            button.setEmoji(parsedEmoji);
                        }
                    }

                    buttons.push(button);
                });

                for (let i = 0; i < buttons.length; i += 5) {
                    const row = new ActionRowBuilder().addComponents(
                        buttons.slice(i, i + 5),
                    );
                    components.push(row);
                }
            }

            try {
                await interaction.channel.send({ embeds: [embed], components });
                return interaction.reply({
                    content: "✅ Painel de tickets enviado!",
                    ephemeral: true,
                });
            } catch (error) {
                console.error("❌ Erro ao enviar painel:", error);
                return interaction.reply({
                    content: `❌ Erro ao enviar painel: ${error.message}`,
                    ephemeral: true,
                });
            }
        }

        if (interaction.commandName === "deletar_painel") {
            if (
                !interaction.member.permissions.has(
                    PermissionFlagsBits.Administrator,
                )
            ) {
                return interaction.reply({
                    content: "❌ Você precisa ser um administrador!",
                    ephemeral: true,
                });
            }

            const panelId = interaction.options.getString("painel");

            if (!config[interaction.guildId]?.panels?.[panelId]) {
                return interaction.reply({
                    content: "❌ Painel não encontrado!",
                    ephemeral: true,
                });
            }

            const panelName = config[interaction.guildId].panels[panelId].name;
            delete config[interaction.guildId].panels[panelId];
            saveConfig();

            userPanelContext.forEach((value, key) => {
                if (value === panelId && key.startsWith(interaction.guildId)) {
                    userPanelContext.delete(key);
                }
            });

            const embed = new EmbedBuilder()
                .setTitle("🗑️ Painel Deletado!")
                .setDescription(`O painel **${panelName}** foi removido.`)
                .setColor(0xff6b6b)
                .setFooter({ text: "Powered by 7M Store" })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const commandsRequiringPanel = [
            "setup",
            "logs",
            "add_cargo",
            "remove_cargo",
            "list_cargos",
            "add_button",
            "remove_button",
            "list_buttons",
            "add_setor",
            "remove_setor",
            "list_setores",
            "edit_titulo",
            "edit_descricao",
            "edit_imagem",
            "edit_thumbnail",
            "edit_footer",
            "edit_color",
            "ver_personalizacao",
            "set_tipo_painel",
        ];

        if (commandsRequiringPanel.includes(interaction.commandName)) {
            const selectedPanelId = getSelectedPanel(
                interaction.user.id,
                interaction.guildId,
            );

            if (!selectedPanelId) {
                return interaction.reply({
                    content:
                        "❌ Você precisa selecionar um painel primeiro! Use `/selecionar_painel` ou `/criar_painel`.",
                    ephemeral: true,
                });
            }

            const panelConfig = getPanelConfig(
                interaction.guildId,
                selectedPanelId,
            );
            if (!panelConfig) {
                return interaction.reply({
                    content:
                        "❌ O painel selecionado não existe mais! Use `/selecionar_painel`.",
                    ephemeral: true,
                });
            }

            if (interaction.commandName === "setup") {
                if (
                    !interaction.member.permissions.has(
                        PermissionFlagsBits.Administrator,
                    )
                ) {
                    return interaction.reply({
                        content: "❌ Você precisa ser um administrador!",
                        ephemeral: true,
                    });
                }

                const cargo = interaction.options.getRole("cargo");
                const categoria = interaction.options.getChannel("categoria");

                panelConfig.supportRoleId = cargo.id;
                panelConfig.categoryId = categoria.id;
                if (!panelConfig.supportRoles) {
                    panelConfig.supportRoles = [cargo.id];
                } else if (!panelConfig.supportRoles.includes(cargo.id)) {
                    panelConfig.supportRoles.push(cargo.id);
                }
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle("✅ Configuração Concluída!")
                    .setDescription(
                        `**Painel "${panelConfig.name}" configurado com sucesso!**\n\n📌 **Cargo de Suporte:** ${cargo}\n📁 **Categoria:** ${categoria.name}`,
                    )
                    .setColor(0x00ff00)
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === "logs") {
                if (
                    !interaction.member.permissions.has(
                        PermissionFlagsBits.Administrator,
                    )
                ) {
                    return interaction.reply({
                        content: "❌ Você precisa ser um administrador!",
                        ephemeral: true,
                    });
                }

                const canal = interaction.options.getChannel("canal");
                panelConfig.logsChannelId = canal.id;
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle("✅ Canal de Logs Configurado!")
                    .setDescription(
                        `**Canal de logs do painel "${panelConfig.name}" configurado!**\n\n📋 **Canal de Logs:** ${canal}`,
                    )
                    .setColor(0x00ff00)
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === "add_cargo") {
                if (
                    !interaction.member.permissions.has(
                        PermissionFlagsBits.Administrator,
                    )
                ) {
                    return interaction.reply({
                        content: "❌ Você precisa ser um administrador!",
                        ephemeral: true,
                    });
                }

                const cargo = interaction.options.getRole("cargo");

                if (!panelConfig.supportRoles) {
                    panelConfig.supportRoles = [];
                }

                if (panelConfig.supportRoles.includes(cargo.id)) {
                    return interaction.reply({
                        content: "❌ Este cargo já está configurado!",
                        ephemeral: true,
                    });
                }

                panelConfig.supportRoles.push(cargo.id);
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle("✅ Cargo Adicionado!")
                    .setDescription(
                        `**Cargo adicionado ao painel "${panelConfig.name}"!**\n\n📌 **Cargo:** ${cargo}`,
                    )
                    .setColor(0x00ff00)
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === "remove_cargo") {
                if (
                    !interaction.member.permissions.has(
                        PermissionFlagsBits.Administrator,
                    )
                ) {
                    return interaction.reply({
                        content: "❌ Você precisa ser um administrador!",
                        ephemeral: true,
                    });
                }

                const cargo = interaction.options.getRole("cargo");

                if (!panelConfig.supportRoles) {
                    return interaction.reply({
                        content: "❌ Nenhum cargo configurado ainda!",
                        ephemeral: true,
                    });
                }

                const index = panelConfig.supportRoles.indexOf(cargo.id);
                if (index === -1) {
                    return interaction.reply({
                        content: "❌ Este cargo não está na lista!",
                        ephemeral: true,
                    });
                }

                panelConfig.supportRoles.splice(index, 1);
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle("🗑️ Cargo Removido!")
                    .setDescription(
                        `**Cargo removido do painel "${panelConfig.name}"!**\n\n📌 **Cargo:** ${cargo}`,
                    )
                    .setColor(0xff6b6b)
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === "list_cargos") {
                if (
                    !panelConfig.supportRoles ||
                    panelConfig.supportRoles.length === 0
                ) {
                    return interaction.reply({
                        content: "❌ Nenhum cargo de suporte configurado!",
                        ephemeral: true,
                    });
                }

                const cargos = panelConfig.supportRoles
                    .map((roleId) => {
                        const role = interaction.guild.roles.cache.get(roleId);
                        return role
                            ? `• ${role}`
                            : `• ID: ${roleId} (cargo não encontrado)`;
                    })
                    .join("\n");

                const embed = new EmbedBuilder()
                    .setTitle(`📋 Cargos - ${panelConfig.name}`)
                    .setDescription(cargos)
                    .setColor(0x0099ff)
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === "add_button") {
                if (
                    !interaction.member.permissions.has(
                        PermissionFlagsBits.Administrator,
                    )
                ) {
                    return interaction.reply({
                        content: "❌ Você precisa ser um administrador!",
                        ephemeral: true,
                    });
                }

                const label = interaction.options.getString("label");
                const emoji = interaction.options.getString("emoji");
                const cor = interaction.options.getString("cor") || "Primary";

                const labelValidation = validateButtonLabel(label);
                if (!labelValidation.valid) {
                    return interaction.reply({
                        content: `❌ ${labelValidation.error}`,
                        ephemeral: true,
                    });
                }

                const selectedPanelId = getSelectedPanel(
                    interaction.user.id,
                    interaction.guildId,
                );
                const testCustomId = createSafeCustomId(selectedPanelId, label);
                const customIdValidation = validateCustomId(testCustomId);
                if (!customIdValidation.valid) {
                    return interaction.reply({
                        content: `❌ O label é muito longo! O ID gerado (${testCustomId.length} chars) excede o limite de 100 caracteres. Use um label mais curto.`,
                        ephemeral: true,
                    });
                }

                if (emoji && !isValidEmoji(emoji)) {
                    return interaction.reply({
                        content:
                            "❌ Emoji inválido! Use um emoji Unicode válido (🎫) ou personalizado (<:nome:id>).",
                        ephemeral: true,
                    });
                }

                if (!panelConfig.customButtons) {
                    panelConfig.customButtons = [];
                }

                if (
                    panelConfig.customButtons.some((btn) => btn.label === label)
                ) {
                    return interaction.reply({
                        content: "❌ Já existe um botão com esse label!",
                        ephemeral: true,
                    });
                }

                panelConfig.customButtons.push({ label, emoji, style: cor });
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle("✅ Botão Adicionado!")
                    .setDescription(
                        `**Botão adicionado ao painel "${panelConfig.name}"!**\n\n🏷️ **Label:** ${label}\n${emoji ? `😀 **Emoji:** ${emoji}\n` : ""}🎨 **Cor:** ${cor}`,
                    )
                    .setColor(0x00ff00)
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === "remove_button") {
                if (
                    !interaction.member.permissions.has(
                        PermissionFlagsBits.Administrator,
                    )
                ) {
                    return interaction.reply({
                        content: "❌ Você precisa ser um administrador!",
                        ephemeral: true,
                    });
                }

                const label = interaction.options.getString("label");

                if (!panelConfig.customButtons) {
                    return interaction.reply({
                        content: "❌ Nenhum botão configurado ainda!",
                        ephemeral: true,
                    });
                }

                const index = panelConfig.customButtons.findIndex(
                    (btn) => btn.label === label,
                );
                if (index === -1) {
                    return interaction.reply({
                        content: "❌ Botão não encontrado!",
                        ephemeral: true,
                    });
                }

                panelConfig.customButtons.splice(index, 1);
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle("🗑️ Botão Removido!")
                    .setDescription(
                        `**Botão removido do painel "${panelConfig.name}"!**\n\n🏷️ **Label:** ${label}`,
                    )
                    .setColor(0xff6b6b)
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === "list_buttons") {
                if (
                    !panelConfig.customButtons ||
                    panelConfig.customButtons.length === 0
                ) {
                    return interaction.reply({
                        content: "❌ Nenhum botão personalizado configurado!",
                        ephemeral: true,
                    });
                }

                const botoes = panelConfig.customButtons
                    .map(
                        (btn, i) =>
                            `${i + 1}. **${btn.label}** ${btn.emoji || ""} - Cor: ${btn.style}`,
                    )
                    .join("\n");

                const embed = new EmbedBuilder()
                    .setTitle(`🔘 Botões - ${panelConfig.name}`)
                    .setDescription(botoes)
                    .setColor(0x0099ff)
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === "add_setor") {
                if (
                    !interaction.member.permissions.has(
                        PermissionFlagsBits.Administrator,
                    )
                ) {
                    return interaction.reply({
                        content: "❌ Você precisa ser um administrador!",
                        ephemeral: true,
                    });
                }

                const nome = interaction.options.getString("nome");
                const descricao = interaction.options.getString("descricao");
                const emoji = interaction.options.getString("emoji");

                const setorValidation = validateSelectMenuOption(
                    nome,
                    nome,
                    descricao,
                );
                if (!setorValidation.valid) {
                    return interaction.reply({
                        content: `❌ ${setorValidation.error}`,
                        ephemeral: true,
                    });
                }

                if (emoji && !isValidEmoji(emoji)) {
                    return interaction.reply({
                        content:
                            "❌ Emoji inválido! Use um emoji Unicode válido (🎫) ou personalizado (<:nome:id>).",
                        ephemeral: true,
                    });
                }

                if (!panelConfig.setores) {
                    panelConfig.setores = [];
                }

                if (panelConfig.setores.some((s) => s.nome === nome)) {
                    return interaction.reply({
                        content: "❌ Já existe um setor com esse nome!",
                        ephemeral: true,
                    });
                }

                panelConfig.setores.push({ nome, descricao, emoji });
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle("✅ Setor Adicionado!")
                    .setDescription(
                        `**Setor adicionado ao painel "${panelConfig.name}"!**\n\n📌 **Nome:** ${nome}\n📝 **Descrição:** ${descricao}${emoji ? `\n😀 **Emoji:** ${emoji}` : ""}`,
                    )
                    .setColor(0x00ff00)
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === "remove_setor") {
                if (
                    !interaction.member.permissions.has(
                        PermissionFlagsBits.Administrator,
                    )
                ) {
                    return interaction.reply({
                        content: "❌ Você precisa ser um administrador!",
                        ephemeral: true,
                    });
                }

                const nome = interaction.options.getString("nome");

                if (!panelConfig.setores) {
                    return interaction.reply({
                        content: "❌ Nenhum setor configurado ainda!",
                        ephemeral: true,
                    });
                }

                const index = panelConfig.setores.findIndex(
                    (s) => s.nome === nome,
                );
                if (index === -1) {
                    return interaction.reply({
                        content: "❌ Setor não encontrado!",
                        ephemeral: true,
                    });
                }

                panelConfig.setores.splice(index, 1);
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle("🗑️ Setor Removido!")
                    .setDescription(
                        `**Setor removido do painel "${panelConfig.name}"!**\n\n📌 **Nome:** ${nome}`,
                    )
                    .setColor(0xff6b6b)
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === "list_setores") {
                if (!panelConfig.setores || panelConfig.setores.length === 0) {
                    return interaction.reply({
                        content: "❌ Nenhum setor configurado ainda!",
                        ephemeral: true,
                    });
                }

                const setores = panelConfig.setores
                    .map(
                        (s, i) =>
                            `${i + 1}. ${s.emoji || "📌"} **${s.nome}** - ${s.descricao}`,
                    )
                    .join("\n");

                const embed = new EmbedBuilder()
                    .setTitle(`📂 Setores - ${panelConfig.name}`)
                    .setDescription(setores)
                    .setColor(0x0099ff)
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === "edit_titulo") {
                if (
                    !interaction.member.permissions.has(
                        PermissionFlagsBits.Administrator,
                    )
                ) {
                    return interaction.reply({
                        content: "❌ Você precisa ser um administrador!",
                        ephemeral: true,
                    });
                }

                const titulo = interaction.options.getString("titulo");

                if (!panelConfig.customization) {
                    panelConfig.customization = {};
                }

                if (titulo !== null) {
                    panelConfig.customization.title = titulo;
                }
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle(
                        titulo && titulo.trim()
                            ? "✅ Título Atualizado!"
                            : "🗑️ Título Removido!",
                    )
                    .setDescription(
                        titulo && titulo.trim()
                            ? `**Novo título do painel "${panelConfig.name}":**\n\n${titulo}`
                            : `**Título removido do painel "${panelConfig.name}". Nenhum título será exibido.**`,
                    )
                    .setColor(titulo && titulo.trim() ? 0x00ff00 : 0xff6b6b)
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === "edit_descricao") {
                if (
                    !interaction.member.permissions.has(
                        PermissionFlagsBits.Administrator,
                    )
                ) {
                    return interaction.reply({
                        content: "❌ Você precisa ser um administrador!",
                        ephemeral: true,
                    });
                }

                const descricao = interaction.options.getString("descricao");

                if (!panelConfig.customization) {
                    panelConfig.customization = {};
                }

                if (descricao !== null) {
                    panelConfig.customization.description = descricao;
                }
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle(
                        descricao && descricao.trim()
                            ? "✅ Descrição Atualizada!"
                            : "🗑️ Descrição Removida!",
                    )
                    .setDescription(
                        descricao && descricao.trim()
                            ? `**Nova descrição configurada para o painel "${panelConfig.name}"!**\n\n${descricao}`
                            : `**Descrição removida do painel "${panelConfig.name}". Nenhuma descrição será exibida.**`,
                    )
                    .setColor(
                        descricao && descricao.trim() ? 0x00ff00 : 0xff6b6b,
                    )
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === "edit_imagem") {
                if (
                    !interaction.member.permissions.has(
                        PermissionFlagsBits.Administrator,
                    )
                ) {
                    return interaction.reply({
                        content: "❌ Você precisa ser um administrador!",
                        ephemeral: true,
                    });
                }

                const url = interaction.options.getString("url");

                if (url && url.trim() && !isValidUrl(url)) {
                    return interaction.reply({
                        content:
                            "❌ URL inválida! Use uma URL válida começando com http:// ou https://.",
                        ephemeral: true,
                    });
                }

                if (!panelConfig.customization) {
                    panelConfig.customization = {};
                }

                if (url !== null) {
                    panelConfig.customization.image = url;
                }
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle(
                        url && url.trim()
                            ? "✅ Imagem Atualizada!"
                            : "🗑️ Imagem Removida!",
                    )
                    .setDescription(
                        url && url.trim()
                            ? `**Imagem do painel "${panelConfig.name}" atualizada!**\n\n📷 URL: ${url}`
                            : `**Imagem removida do painel "${panelConfig.name}". Nenhuma imagem será exibida.**`,
                    )
                    .setColor(url && url.trim() ? 0x00ff00 : 0xff6b6b)
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === "edit_thumbnail") {
                if (
                    !interaction.member.permissions.has(
                        PermissionFlagsBits.Administrator,
                    )
                ) {
                    return interaction.reply({
                        content: "❌ Você precisa ser um administrador!",
                        ephemeral: true,
                    });
                }

                const url = interaction.options.getString("url");

                if (url && url.trim() && !isValidUrl(url)) {
                    return interaction.reply({
                        content:
                            "❌ URL inválida! Use uma URL válida começando com http:// ou https://.",
                        ephemeral: true,
                    });
                }

                if (!panelConfig.customization) {
                    panelConfig.customization = {};
                }

                if (url !== null) {
                    panelConfig.customization.thumbnail = url;
                }
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle(
                        url && url.trim()
                            ? "✅ Thumbnail Atualizada!"
                            : "🗑️ Thumbnail Removida!",
                    )
                    .setDescription(
                        url && url.trim()
                            ? `**Thumbnail do painel "${panelConfig.name}" atualizada!**\n\n📷 URL: ${url}`
                            : `**Thumbnail removida do painel "${panelConfig.name}". Nenhuma thumbnail será exibida.**`,
                    )
                    .setColor(url && url.trim() ? 0x00ff00 : 0xff6b6b)
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === "edit_footer") {
                if (
                    !interaction.member.permissions.has(
                        PermissionFlagsBits.Administrator,
                    )
                ) {
                    return interaction.reply({
                        content: "❌ Você precisa ser um administrador!",
                        ephemeral: true,
                    });
                }

                const texto = interaction.options.getString("texto");

                if (!panelConfig.customization) {
                    panelConfig.customization = {};
                }

                if (texto !== null) {
                    panelConfig.customization.footer = texto;
                }
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle(
                        texto && texto.trim()
                            ? "✅ Rodapé Atualizado!"
                            : "🗑️ Rodapé Removido!",
                    )
                    .setDescription(
                        texto && texto.trim()
                            ? `**Rodapé do painel "${panelConfig.name}" atualizado!**\n\n📝 Texto: ${texto}`
                            : `**Rodapé removido do painel "${panelConfig.name}". Nenhum rodapé será exibido.**`,
                    )
                    .setColor(texto && texto.trim() ? 0x00ff00 : 0xff6b6b)
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === "edit_color") {
                if (
                    !interaction.member.permissions.has(
                        PermissionFlagsBits.Administrator,
                    )
                ) {
                    return interaction.reply({
                        content: "❌ Você precisa ser um administrador!",
                        ephemeral: true,
                    });
                }

                let cor = interaction.options.getString("cor");

                let colorValue;
                if (cor.startsWith("#")) {
                    colorValue = parseInt(cor.substring(1), 16);
                } else if (cor.startsWith("0x")) {
                    colorValue = parseInt(cor, 16);
                } else {
                    const namedColors = {
                        vermelho: 0xff0000,
                        red: 0xff0000,
                        verde: 0x00ff00,
                        green: 0x00ff00,
                        azul: 0x0099ff,
                        blue: 0x0099ff,
                        amarelo: 0xffff00,
                        yellow: 0xffff00,
                        roxo: 0x9b59b6,
                        purple: 0x9b59b6,
                        laranja: 0xff9900,
                        orange: 0xff9900,
                        rosa: 0xff69b4,
                        pink: 0xff69b4,
                        preto: 0x000000,
                        black: 0x000000,
                        branco: 0xffffff,
                        white: 0xffffff,
                        cinza: 0x808080,
                        gray: 0x808080,
                    };
                    colorValue = namedColors[cor.toLowerCase()];
                }

                if (colorValue === undefined || isNaN(colorValue)) {
                    return interaction.reply({
                        content:
                            "❌ Cor inválida! Use formato hexadecimal (#0099FF ou 0x0099FF) ou nome de cor (vermelho, verde, azul, etc).",
                        ephemeral: true,
                    });
                }

                if (!panelConfig.customization) {
                    panelConfig.customization = {};
                }

                panelConfig.customization.color = colorValue;
                saveConfig();

                const embed = new EmbedBuilder()
                    .setTitle("✅ Cor Atualizada!")
                    .setDescription(
                        `**Cor da borda do painel "${panelConfig.name}" atualizada!**`,
                    )
                    .setColor(colorValue)
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === "ver_personalizacao") {
                const custom = panelConfig.customization || {};
                const tipoTexto =
                    panelConfig.type === "buttons" ? "Botões" : "Select Menu";

                const info = [
                    `**Painel:** ${panelConfig.name}`,
                    "",
                    `🎛️ **Tipo:** ${tipoTexto}`,
                    `📝 **Título:** ${custom.title || "Padrão"}`,
                    `📄 **Descrição:** ${custom.description ? "Personalizada ✓" : "Padrão"}`,
                    `🎨 **Cor:** ${custom.color !== undefined ? `#${custom.color.toString(16).padStart(6, "0").toUpperCase()}` : "Padrão (#0099FF)"}`,
                    `🖼️ **Imagem:** ${custom.image || "Padrão"}`,
                    `🖼️ **Thumbnail:** ${custom.thumbnail || "Nenhuma"}`,
                    `📌 **Rodapé:** ${custom.footer || "Padrão (Powered by 7M Store)"}`,
                ].join("\n");

                const embed = new EmbedBuilder()
                    .setTitle("🎨 Personalização do Painel")
                    .setDescription(info)
                    .setColor(custom.color || 0x0099ff)
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                if (custom.thumbnail && isValidUrl(custom.thumbnail)) {
                    embed.setThumbnail(custom.thumbnail);
                }

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.commandName === "set_tipo_painel") {
                if (
                    !interaction.member.permissions.has(
                        PermissionFlagsBits.Administrator,
                    )
                ) {
                    return interaction.reply({
                        content: "❌ Você precisa ser um administrador!",
                        ephemeral: true,
                    });
                }

                const tipo = interaction.options.getString("tipo");
                panelConfig.type = tipo;
                saveConfig();

                const tipoTexto =
                    tipo === "select_menu"
                        ? "Select Menu (Dropdown)"
                        : "Botões";
                const embed = new EmbedBuilder()
                    .setTitle("✅ Tipo de Painel Atualizado!")
                    .setDescription(
                        `**O painel "${panelConfig.name}" agora usa:** ${tipoTexto}\n\n${tipo === "buttons" ? "💡 Use \`/add_button\` para adicionar botões personalizados!" : "💡 Use \`/add_setor\` para adicionar opções ao menu!"}`,
                    )
                    .setColor(0x00ff00)
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }

        if (interaction.commandName === "adduser") {
            const channel = interaction.channel;

            if (!channel.name.startsWith("ticket-de-")) {
                return interaction.reply({
                    content:
                        "❌ Este comando só pode ser usado em canais de ticket!",
                    ephemeral: true,
                });
            }

            const usuario = interaction.options.getUser("usuario");

            try {
                await channel.permissionOverwrites.create(usuario.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                });

                const addEmbed = new EmbedBuilder()
                    .setTitle("✅ Usuário Adicionado")
                    .setDescription(
                        `${usuario} foi adicionado ao ticket por ${interaction.user}.`,
                    )
                    .setColor(0x00ff00)
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                await interaction.reply({ embeds: [addEmbed] });
                console.log(
                    `✅ Usuário ${usuario.tag} adicionado ao ${channel.name} por ${interaction.user.tag}`,
                );
            } catch (error) {
                console.error("❌ Erro ao adicionar usuário:", error);
                return interaction.reply({
                    content:
                        "❌ Erro ao adicionar o usuário. Verifique as permissões do bot.",
                    ephemeral: true,
                });
            }
        }

        if (interaction.commandName === "remove_user") {
            const channel = interaction.channel;

            if (!channel.name.startsWith("ticket-de-")) {
                return interaction.reply({
                    content:
                        "❌ Este comando só pode ser usado em canais de ticket!",
                    ephemeral: true,
                });
            }

            const usuario = interaction.options.getUser("usuario");

            try {
                await channel.permissionOverwrites.delete(usuario.id);

                const removeEmbed = new EmbedBuilder()
                    .setTitle("🚫 Usuário Removido")
                    .setDescription(
                        `${usuario} foi removido do ticket por ${interaction.user}.`,
                    )
                    .setColor(0xff6b6b)
                    .setFooter({ text: "Powered by 7M Store" })
                    .setTimestamp();

                await interaction.reply({ embeds: [removeEmbed] });
                console.log(
                    `🚫 Usuário ${usuario.tag} removido do ${channel.name} por ${interaction.user.tag}`,
                );
            } catch (error) {
                console.error("❌ Erro ao remover usuário:", error);
                return interaction.reply({
                    content:
                        "❌ Erro ao remover o usuário. Verifique as permissões do bot.",
                    ephemeral: true,
                });
            }
        }
    }

    if (interaction.isButton()) {
        if (interaction.customId.startsWith("create_ticket:")) {
            const parts = interaction.customId.split(":");
            const panelId = parts[1];
            const buttonLabel = parts.slice(2).join(":");

            const panelConfig = getPanelConfig(interaction.guildId, panelId);

            if (!panelConfig || !panelConfig.categoryId) {
                return interaction.reply({
                    content:
                        "❌ Este painel não está configurado corretamente! Peça a um administrador para usar `/selecionar_painel` e `/setup`.",
                    ephemeral: true,
                });
            }

            const sanitizedUsername = sanitizeUsername(
                interaction.user.username,
            );
            const ticketChannelName = `ticket-de-${sanitizedUsername}`;

            const existingChannel = interaction.guild.channels.cache.find(
                (ch) =>
                    ch.name === ticketChannelName &&
                    ch.type === ChannelType.GuildText,
            );

            if (existingChannel) {
                return interaction.reply({
                    content: `❌ Você já tem um ticket aberto: ${existingChannel}`,
                    ephemeral: true,
                });
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                const permissionOverwrites = [
                    {
                        id: interaction.guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: interaction.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                        ],
                    },
                    {
                        id: client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ManageChannels,
                        ],
                    },
                ];

                if (
                    panelConfig.supportRoles &&
                    panelConfig.supportRoles.length > 0
                ) {
                    panelConfig.supportRoles.forEach((roleId) => {
                        permissionOverwrites.push({
                            id: roleId,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                            ],
                        });
                    });
                } else if (panelConfig.supportRoleId) {
                    permissionOverwrites.push({
                        id: panelConfig.supportRoleId,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                        ],
                    });
                }

                const ticketChannel = await interaction.guild.channels.create({
                    name: ticketChannelName,
                    type: ChannelType.GuildText,
                    parent: panelConfig.categoryId,
                    permissionOverwrites: permissionOverwrites,
                });

                ticketMetadata.set(ticketChannel.id, {
                    guildId: interaction.guildId,
                    panelId: panelId,
                    userId: interaction.user.id,
                    channelId: ticketChannel.id,
                    reason: buttonLabel,
                });

                const ticketEmbed = new EmbedBuilder()
                    .setTitle("🎫 Ticket - Menu Inicial")
                    .setDescription(
                        "Aguarde a chegada da equipe de suporte para dar continuidade ao atendimento. Enquanto isso, aproveite para nos fornecer mais detalhes sobre o que você precisa.",
                    )
                    .addFields(
                        {
                            name: "👤 Usuário",
                            value: `${interaction.user} 🎲`,
                            inline: false,
                        },
                        {
                            name: "📄 Motivo",
                            value: buttonLabel,
                            inline: false,
                        },
                        {
                            name: "👮 Staff",
                            value: "Ninguém reivindicou esse ticket!",
                            inline: false,
                        },
                    )
                    .setColor(0x5865f2)
                    .setFooter({ text: "Mensagem de: DRAGON STORE" })
                    .setTimestamp();

                const row = buildTicketControls();

                const mentionRoles =
                    panelConfig.supportRoles &&
                    panelConfig.supportRoles.length > 0
                        ? panelConfig.supportRoles
                              .map((roleId) => `<@&${roleId}>`)
                              .join(" ")
                        : panelConfig.supportRoleId
                          ? `<@&${panelConfig.supportRoleId}>`
                          : "";

                const controlMessage = await ticketChannel.send({
                    content: `${interaction.user}${mentionRoles ? " " + mentionRoles : ""}`,
                    embeds: [ticketEmbed],
                    components: [row],
                });

                const metadata = ticketMetadata.get(ticketChannel.id);
                if (metadata) {
                    metadata.controlMessageId = controlMessage.id;
                }

                const goToTicketButton = new ButtonBuilder()
                    .setLabel("Go to Ticket")
                    .setEmoji("🔗")
                    .setStyle(ButtonStyle.Link)
                    .setURL(
                        `https://discord.com/channels/${interaction.guildId}/${ticketChannel.id}`,
                    );

                const buttonRow = new ActionRowBuilder().addComponents(
                    goToTicketButton,
                );

                await interaction.editReply({
                    content: "✅ Your ticket has been created!",
                    components: [buttonRow],
                });

                console.log(
                    `✅ Ticket criado: ${ticketChannelName} por ${interaction.user.tag} - Painel: ${panelConfig.name} - Botão: ${buttonLabel}`,
                );

                if (panelConfig.logsChannelId) {
                    const logsChannel = interaction.guild.channels.cache.get(
                        panelConfig.logsChannelId,
                    );
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle("📂 Ticket Aberto")
                            .setDescription(
                                `**Usuário:** ${interaction.user} (${interaction.user.tag})\n**ID:** ${interaction.user.id}\n**Painel:** ${panelConfig.name}\n**Categoria:** ${buttonLabel}\n**Canal:** ${ticketChannel}\n**Horário:** <t:${Math.floor(Date.now() / 1000)}:F>`,
                            )
                            .setColor(0x00ff00)
                            .setFooter({ text: "Powered by 7M Store" })
                            .setTimestamp();

                        await logsChannel
                            .send({ embeds: [logEmbed] })
                            .catch((err) => {
                                console.error(
                                    "❌ Erro ao enviar log de ticket aberto:",
                                    err,
                                );
                            });
                    }
                }
            } catch (error) {
                console.error("❌ Erro ao criar ticket:", error);
                return interaction.followUp({
                    content: `❌ Erro ao criar o ticket: ${error.message}`,
                    ephemeral: true,
                });
            }
        }

        if (interaction.customId === "reivindicar_ticket") {
            const channel = interaction.channel;

            if (!channel.name.startsWith("ticket-de-")) {
                return interaction.reply({
                    content:
                        "❌ Este comando só pode ser usado em canais de ticket!",
                    ephemeral: true,
                });
            }

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
                    content:
                        "❌ Apenas membros da equipe de suporte podem reivindicar tickets!",
                    ephemeral: true,
                });
            }

            const context = getTicketContext(channel.id);
            let ticketMessage = null;

            try {
                if (context && context.controlMessageId) {
                    ticketMessage = await channel.messages.fetch(
                        context.controlMessageId,
                    );
                } else {
                    const messages = await channel.messages.fetch({ limit: 10 });
                    ticketMessage = messages.find(
                        (msg) =>
                            msg.author.id === client.user.id &&
                            msg.embeds.length > 0 &&
                            msg.embeds[0].title === "🎫 Ticket - Menu Inicial",
                    );
                }

                if (!ticketMessage) {
                    return interaction.reply({
                        content:
                            "❌ Não foi possível encontrar a mensagem de controle do ticket!",
                        ephemeral: true,
                    });
                }

                const oldEmbed = ticketMessage.embeds[0];
                const updatedEmbed = EmbedBuilder.from(oldEmbed);

                updatedEmbed.data.fields = oldEmbed.fields.map((field) => {
                    if (field.name === "👮 Staff") {
                        return { ...field, value: `${interaction.user}` };
                    }
                    return field;
                });

                await ticketMessage.edit({
                    embeds: [updatedEmbed],
                    components: ticketMessage.components,
                });

                ticketClaimedBy.set(channel.id, interaction.user.tag);
            } catch (error) {
                console.error("Erro ao atualizar embed do ticket:", error);
                return interaction.reply({
                    content:
                        "❌ Não foi possível atualizar o ticket. A mensagem de controle pode ter sido deletada.",
                    ephemeral: true,
                });
            }

            const claimEmbed = new EmbedBuilder()
                .setTitle("✋ Ticket Reivindicado")
                .setDescription(
                    `Este ticket foi reivindicado por ${interaction.user}.\n\nEle será responsável pelo atendimento.`,
                )
                .setColor(0xffd700)
                .setFooter({ text: "Powered by 7M Store" })
                .setTimestamp();

            await interaction.reply({ embeds: [claimEmbed] });
            console.log(
                `✋ Ticket ${channel.name} reivindicado por ${interaction.user.tag}`,
            );
        }

        if (interaction.customId === "fechar_ticket") {
            const channel = interaction.channel;

            if (!channel.name.startsWith("ticket-de-")) {
                return interaction.reply({
                    content:
                        "❌ Este comando só pode ser usado em canais de ticket!",
                    ephemeral: true,
                });
            }

            const context = getTicketContext(channel.id);
            if (!context) {
                console.warn("⚠️ Contexto do ticket não encontrado (bot pode ter sido reiniciado)");
            }

            await interaction.deferReply();

            const transcript = await generateTranscript(channel);

            const closeEmbed = new EmbedBuilder()
                .setTitle("🔒 Ticket Fechado")
                .setDescription(
                    `Ticket fechado por ${interaction.user}.\n\nEste canal será deletado em 5 segundos...`,
                )
                .setColor(0xff0000)
                .setFooter({ text: "Powered by 7M Store" })
                .setTimestamp();

            await interaction.editReply({ embeds: [closeEmbed] });

            console.log(
                `🔒 Ticket fechado: ${channel.name} por ${interaction.user.tag}`,
            );

            if (context && context.userId) {
                try {
                    const ticketUser = await client.users.fetch(context.userId);
                    
                    const reason = context.reason || "Não especificado";
                    const ticketName = channel.name;
                    const serverName = interaction.guild.name;

                    const dmEmbed = new EmbedBuilder()
                        .setTitle("Ticket Fechado")
                        .setDescription(`Este ticket foi fechado por ${interaction.user}.`)
                        .addFields(
                            { name: "Motivo", value: reason, inline: false },
                            { name: "Nome do Ticket", value: ticketName, inline: false },
                            { name: "Servidor", value: serverName, inline: false }
                        )
                        .setColor(0x5865f2)
                        .setTimestamp();

                    const transcriptButton = new ButtonBuilder()
                        .setCustomId(`view_transcript:${channel.id}`)
                        .setLabel("Ver Transcrição")
                        .setEmoji("📄")
                        .setStyle(ButtonStyle.Secondary);

                    const transcriptRow = new ActionRowBuilder().addComponents(transcriptButton);

                    await ticketUser.send({
                        embeds: [dmEmbed],
                        components: [transcriptRow]
                    });

                    console.log(`✅ DM enviada para ${ticketUser.tag} sobre o fechamento do ticket`);

                    if (transcript) {
                        const transcriptMap = new Map();
                        transcriptMap.set(channel.id, transcript);
                        client.transcriptCache = client.transcriptCache || new Map();
                        client.transcriptCache.set(channel.id, transcript);
                    }

                } catch (dmError) {
                    console.error(`❌ Erro ao enviar DM para o usuário ${context.userId}:`, dmError.message);
                    console.log("⚠️ O usuário pode ter DMs desativadas ou bloqueou o bot");
                }
            }

            const guildConfig = config[interaction.guildId];
            if (guildConfig?.panels) {
                let logSent = false;
                for (const panel of Object.values(guildConfig.panels)) {
                    if (panel.logsChannelId && !logSent) {
                        const logsChannel =
                            interaction.guild.channels.cache.get(
                                panel.logsChannelId,
                            );
                        if (logsChannel) {
                            const username = channel.name.replace(
                                "ticket-de-",
                                "",
                            );

                            const logEmbed = new EmbedBuilder()
                                .setTitle("🔒 Ticket Fechado")
                                .setDescription(
                                    `**Username do Ticket:** ${username}\n` +
                                        `**Fechado por:** ${interaction.user} (${interaction.user.tag})\n` +
                                        `**Canal:** #${channel.name}\n` +
                                        `**Horário:** <t:${Math.floor(Date.now() / 1000)}:F>`,
                                )
                                .setColor(0xff0000)
                                .setFooter({ text: "Powered by 7M Store" })
                                .setTimestamp();

                            await logsChannel
                                .send({ embeds: [logEmbed] })
                                .catch((err) => {
                                    console.error(
                                        "❌ Erro ao enviar log de ticket fechado:",
                                        err,
                                    );
                                });
                            logSent = true;
                        }
                    }
                }
            }

            setTimeout(() => {
                channel.delete().catch((err) => {
                    console.error("❌ Erro ao deletar canal:", err);
                });
            }, 5000);
        }

        if (interaction.customId === "arquivar_ticket") {
            const channel = interaction.channel;

            if (!channel.name.startsWith("ticket-de-")) {
                return interaction.reply({
                    content:
                        "❌ Este comando só pode ser usado em canais de ticket!",
                    ephemeral: true,
                });
            }

            const archiveEmbed = new EmbedBuilder()
                .setTitle("📁 Ticket Arquivado")
                .setDescription(
                    `Ticket arquivado por ${interaction.user}.\n\nEste canal será arquivado.`,
                )
                .setColor(0x95a5a6)
                .setFooter({ text: "Powered by 7M Store" })
                .setTimestamp();

            await interaction.reply({ embeds: [archiveEmbed] });

            try {
                await channel.permissionOverwrites.edit(
                    channel.guild.roles.everyone,
                    {
                        SendMessages: false,
                    },
                );

                const context = getTicketContext(channel.id);
                if (context && context.controlMessageId) {
                    try {
                        const ticketMessage = await channel.messages.fetch(
                            context.controlMessageId,
                        );
                        await ticketMessage.edit({ components: [] });
                    } catch (msgError) {
                        console.error(
                            "⚠️ Não foi possível remover botões da mensagem de controle:",
                            msgError,
                        );
                    }
                }

                console.log(
                    `📁 Ticket arquivado: ${channel.name} por ${interaction.user.tag}`,
                );
            } catch (error) {
                console.error("❌ Erro ao arquivar ticket:", error);
            }
        }

        if (interaction.customId === "ticket_settings") {
            try {
                const context = getTicketContext(interaction.channelId);

                if (!context) {
                    return interaction.reply({
                        content:
                            "❌ Não foi possível recuperar as informações deste ticket! (Bot pode ter sido reiniciado)",
                        ephemeral: true,
                    });
                }

                const panelConfig = getPanelConfig(
                    context.guildId,
                    context.panelId,
                );
                if (!panelConfig) {
                    return interaction.reply({
                        content: "❌ Configuração do painel não encontrada!",
                        ephemeral: true,
                    });
                }

                let hasSupport = false;
                if (
                    panelConfig.supportRoles &&
                    panelConfig.supportRoles.length > 0
                ) {
                    hasSupport = panelConfig.supportRoles.some((roleId) =>
                        interaction.member.roles.cache.has(roleId),
                    );
                } else if (panelConfig.supportRoleId) {
                    hasSupport = interaction.member.roles.cache.has(
                        panelConfig.supportRoleId,
                    );
                }

                if (
                    !hasSupport &&
                    !interaction.member.permissions.has(
                        PermissionFlagsBits.Administrator,
                    )
                ) {
                    return interaction.reply({
                        content:
                            "❌ Apenas membros da equipe de suporte podem acessar as configurações do ticket!",
                        ephemeral: true,
                    });
                }

                const settingsEmbed = new EmbedBuilder()
                    .setTitle("⚙️ Configurações do Ticket")
                    .setDescription(
                        "Selecione uma ação abaixo:\n\nHoje às " +
                            new Date().toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                            }),
                    )
                    .setColor(0x5865f2)
                    .setTimestamp();

                const notifyUserButton = new ButtonBuilder()
                    .setCustomId("ticket_notify_user")
                    .setLabel("Notificar Usuário")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji("📧");

                const notifyStaffButton = new ButtonBuilder()
                    .setCustomId("ticket_notify_staff")
                    .setLabel("Notificar Staff")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji("🔔");

                const unclaimButton = new ButtonBuilder()
                    .setCustomId("ticket_unclaim")
                    .setLabel("Desistir do Ticket")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji("🚫");

                const settingsRow1 = new ActionRowBuilder().addComponents(
                    notifyUserButton,
                    notifyStaffButton,
                    unclaimButton
                );

                return interaction.reply({
                    embeds: [settingsEmbed],
                    components: [settingsRow1],
                    ephemeral: true,
                });
            } catch (error) {
                console.error("❌ Erro no menu de configurações:", error);
                return interaction.reply({
                    content:
                        "❌ Erro ao abrir o menu de configurações! Detalhes: " +
                        error.message,
                    ephemeral: true,
                }).catch(() => {
                    console.error("Não foi possível responder à interação");
                });
            }
        }

        if (interaction.customId === "ticket_notify_user") {
            const modal = new ModalBuilder()
                .setCustomId("modal_notify_user")
                .setTitle("Notificar Usuário");

            const messageInput = new TextInputBuilder()
                .setCustomId("notify_message")
                .setLabel("Mensagem para enviar ao usuário")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder(
                    "Digite a mensagem que será enviada por DM ao criador do ticket...",
                )
                .setRequired(true)
                .setMaxLength(2000);

            const row = new ActionRowBuilder().addComponents(messageInput);
            modal.addComponents(row);

            return await interaction.showModal(modal);
        }

        if (interaction.customId === "ticket_add_user") {
            try {
                const members = await interaction.guild.members.fetch();
                const users = members
                    .filter((member) => !member.user.bot)
                    .map((member) => member)
                    .slice(0, 25);

                if (users.length === 0) {
                    return interaction.reply({
                        content: "❌ Nenhum usuário disponível para adicionar!",
                        ephemeral: true,
                    });
                }

                const rows = [];
                let currentRow = new ActionRowBuilder();
                let buttonCount = 0;

                users.forEach((member, index) => {
                    const button = new ButtonBuilder()
                        .setCustomId(`add_user_${member.user.id}`)
                        .setLabel(member.user.username.substring(0, 80))
                        .setStyle(ButtonStyle.Success);

                    currentRow.addComponents(button);
                    buttonCount++;

                    if (buttonCount === 5 || index === users.length - 1) {
                        rows.push(currentRow);
                        currentRow = new ActionRowBuilder();
                        buttonCount = 0;
                    }
                });

                const embed = new EmbedBuilder()
                    .setTitle("➕ Adicionar Usuário ao Ticket")
                    .setDescription(
                        "Clique no botão do usuário que deseja adicionar:",
                    )
                    .setColor(0x00ff00)
                    .setTimestamp();

                return await interaction.reply({
                    embeds: [embed],
                    components: rows.slice(0, 5),
                    ephemeral: true,
                });
            } catch (error) {
                console.error("Erro ao buscar membros:", error);
                return await interaction.reply({
                    content: "❌ Erro ao buscar membros do servidor!",
                    ephemeral: true,
                });
            }
        }

        if (interaction.customId === "ticket_remove_user") {
            try {
                const members = await interaction.guild.members.fetch();
                const users = members
                    .filter((member) => !member.user.bot)
                    .map((member) => member)
                    .slice(0, 25);

                if (users.length === 0) {
                    return interaction.reply({
                        content: "❌ Nenhum usuário disponível para remover!",
                        ephemeral: true,
                    });
                }

                const rows = [];
                let currentRow = new ActionRowBuilder();
                let buttonCount = 0;

                users.forEach((member, index) => {
                    const button = new ButtonBuilder()
                        .setCustomId(`remove_user_${member.user.id}`)
                        .setLabel(member.user.username.substring(0, 80))
                        .setStyle(ButtonStyle.Danger);

                    currentRow.addComponents(button);
                    buttonCount++;

                    if (buttonCount === 5 || index === users.length - 1) {
                        rows.push(currentRow);
                        currentRow = new ActionRowBuilder();
                        buttonCount = 0;
                    }
                });

                const embed = new EmbedBuilder()
                    .setTitle("➖ Remover Usuário do Ticket")
                    .setDescription(
                        "Clique no botão do usuário que deseja remover:",
                    )
                    .setColor(0xff0000)
                    .setTimestamp();

                return await interaction.reply({
                    embeds: [embed],
                    components: rows.slice(0, 5),
                    ephemeral: true,
                });
            } catch (error) {
                console.error("Erro ao buscar membros:", error);
                return await interaction.reply({
                    content: "❌ Erro ao buscar membros do servidor!",
                    ephemeral: true,
                });
            }
        }

        if (interaction.customId === "ticket_notify_staff") {
                await interaction.deferReply({ ephemeral: true });

                const context = getTicketContext(interaction.channelId);
                if (!context) {
                    return interaction.editReply({
                        content:
                            "❌ Não foi possível recuperar as informações deste ticket!",
                    });
                }

                const panelConfig = getPanelConfig(
                    context.guildId,
                    context.panelId,
                );
                if (!panelConfig) {
                    return interaction.editReply({
                        content: "❌ Configuração do painel não encontrada!",
                    });
                }

                const mentionRoles =
                    panelConfig.supportRoles &&
                    panelConfig.supportRoles.length > 0
                        ? panelConfig.supportRoles
                              .map((roleId) => `<@&${roleId}>`)
                              .join(" ")
                        : panelConfig.supportRoleId
                          ? `<@&${panelConfig.supportRoleId}>`
                          : "";

                if (mentionRoles) {
                    return await interaction.editReply({
                        content: `✅ Equipe de suporte notificada!\n\n🔔 **Cargos notificados:** ${mentionRoles}`,
                    });
                } else {
                    return await interaction.editReply({
                        content:
                            "❌ Nenhum cargo de suporte configurado para notificar!",
                    });
                }
        }

        if (interaction.customId === "ticket_unclaim") {
                await interaction.deferReply({ ephemeral: true });

                const channel = interaction.channel;

                if (!channel.name.startsWith("ticket-de-")) {
                    return interaction.editReply({
                        content:
                            "❌ Este comando só pode ser usado em canais de ticket!",
                    });
                }

                const currentClaimant = ticketClaimedBy.get(channel.id);
                if (!currentClaimant) {
                    return interaction.editReply({
                        content:
                            "❌ Este ticket não foi reivindicado por ninguém!",
                    });
                }

                if (currentClaimant !== interaction.user.tag) {
                    return interaction.editReply({
                        content: `❌ Você não pode desistir deste ticket! Ele foi reivindicado por **${currentClaimant}**.`,
                    });
                }

                const context = getTicketContext(channel.id);
                let ticketMessage = null;

                try {
                    if (context && context.controlMessageId) {
                        ticketMessage = await channel.messages.fetch(
                            context.controlMessageId,
                        );
                    } else {
                        const messages = await channel.messages.fetch({
                            limit: 10,
                        });
                        ticketMessage = messages.find(
                            (msg) =>
                                msg.author.id === client.user.id &&
                                msg.embeds.length > 0 &&
                                msg.embeds[0].title ===
                                    "🎫 Ticket - Menu Inicial",
                        );
                    }

                    if (!ticketMessage) {
                        return await interaction.editReply({
                            content:
                                "❌ Não foi possível encontrar a mensagem de controle do ticket!",
                        });
                    }

                    const oldEmbed = ticketMessage.embeds[0];
                    const updatedEmbed = EmbedBuilder.from(oldEmbed);

                    updatedEmbed.data.fields = oldEmbed.fields.map((field) => {
                        if (field.name === "👮 Staff") {
                            return {
                                ...field,
                                value: "Ninguém reivindicou esse ticket!",
                            };
                        }
                        return field;
                    });

                    await ticketMessage.edit({
                        embeds: [updatedEmbed],
                        components: ticketMessage.components,
                    });

                    ticketClaimedBy.delete(channel.id);

                return await interaction.editReply({
                    content:
                        "✅ Você desistiu deste ticket com sucesso! Outro membro da equipe pode reivindicá-lo agora.",
                });
            } catch (error) {
                console.error("Erro ao desistir do ticket:", error);
                return await interaction.editReply({
                    content:
                        "❌ Erro ao atualizar o ticket. A mensagem de controle pode ter sido deletada.",
                });
            }
        }

        if (interaction.customId.startsWith("add_user_")) {
            const userId = interaction.customId.replace("add_user_", "");

            try {
                const user = await interaction.guild.members.fetch(userId);

                await interaction.channel.permissionOverwrites.create(user, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                });

                await interaction.update({
                    content: `✅ Usuário ${user} adicionado ao ticket com sucesso!`,
                    embeds: [],
                    components: [],
                });
            } catch (error) {
                console.error("Erro ao adicionar usuário:", error);
                await interaction.update({
                    content: "❌ Erro ao adicionar usuário ao ticket!",
                    embeds: [],
                    components: [],
                });
            }
        }

        if (interaction.customId.startsWith("remove_user_")) {
            const userId = interaction.customId.replace("remove_user_", "");

            try {
                const user = await interaction.guild.members.fetch(userId);

                await interaction.channel.permissionOverwrites.delete(user);

                await interaction.update({
                    content: `✅ Usuário ${user} removido do ticket com sucesso!`,
                    embeds: [],
                    components: [],
                });
            } catch (error) {
                console.error("Erro ao remover usuário:", error);
                await interaction.update({
                    content: "❌ Erro ao remover usuário do ticket!",
                    embeds: [],
                    components: [],
                });
            }
        }

        if (interaction.customId.startsWith("view_transcript:")) {
            await interaction.deferReply({ ephemeral: true });

            const channelId = interaction.customId.split(":")[1];
            
            if (!client.transcriptCache) {
                client.transcriptCache = new Map();
            }

            const transcript = client.transcriptCache.get(channelId);

            if (!transcript) {
                return interaction.editReply({
                    content: "❌ Transcrição não disponível. O ticket pode ter sido fechado há muito tempo.",
                    ephemeral: true
                });
            }

            try {
                const buffer = Buffer.from(transcript, 'utf-8');
                const attachment = new AttachmentBuilder(buffer, { 
                    name: `transcript_${channelId}.txt` 
                });

                await interaction.editReply({
                    content: "📄 Aqui está a transcrição do seu ticket:",
                    files: [attachment]
                });

                console.log(`✅ Transcrição enviada para ${interaction.user.tag}`);
            } catch (error) {
                console.error("❌ Erro ao enviar transcrição:", error);
                return interaction.editReply({
                    content: "❌ Erro ao enviar transcrição. Por favor, contate um administrador.",
                });
            }
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith("select_setor:")) {
            const panelId = interaction.customId.split(":")[1];
            const panelConfig = getPanelConfig(interaction.guildId, panelId);

            if (
                !panelConfig ||
                !panelConfig.supportRoleId ||
                !panelConfig.categoryId
            ) {
                return interaction.reply({
                    content:
                        "❌ Este painel não está configurado corretamente! Peça a um administrador para usar `/selecionar_painel` e `/setup`.",
                    ephemeral: true,
                });
            }

            const setorSelecionado = interaction.values[0];
            const sanitizedUsername = sanitizeUsername(
                interaction.user.username,
            );
            const ticketChannelName = `ticket-de-${sanitizedUsername}`;

            const existingChannel = interaction.guild.channels.cache.find(
                (ch) =>
                    ch.name === ticketChannelName &&
                    ch.type === ChannelType.GuildText,
            );

            if (existingChannel) {
                return interaction.reply({
                    content: `❌ Você já tem um ticket aberto: ${existingChannel}`,
                    ephemeral: true,
                });
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                const permissionOverwrites = [
                    {
                        id: interaction.guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: interaction.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                        ],
                    },
                    {
                        id: client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ManageChannels,
                        ],
                    },
                ];

                if (
                    panelConfig.supportRoles &&
                    panelConfig.supportRoles.length > 0
                ) {
                    panelConfig.supportRoles.forEach((roleId) => {
                        permissionOverwrites.push({
                            id: roleId,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                            ],
                        });
                    });
                } else if (panelConfig.supportRoleId) {
                    permissionOverwrites.push({
                        id: panelConfig.supportRoleId,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                        ],
                    });
                }

                const ticketChannel = await interaction.guild.channels.create({
                    name: ticketChannelName,
                    type: ChannelType.GuildText,
                    parent: panelConfig.categoryId,
                    permissionOverwrites: permissionOverwrites,
                });

                ticketMetadata.set(ticketChannel.id, {
                    guildId: interaction.guildId,
                    panelId: panelId,
                    userId: interaction.user.id,
                    channelId: ticketChannel.id,
                    reason: setorSelecionado,
                });

                const ticketEmbed = new EmbedBuilder()
                    .setTitle("🎫 Ticket - Menu Inicial")
                    .setDescription(
                        "Aguarde a chegada da equipe de suporte para dar continuidade ao atendimento. Enquanto isso, aproveite para nos fornecer mais detalhes sobre o que você precisa.",
                    )
                    .addFields(
                        {
                            name: "👤 Usuário",
                            value: `${interaction.user} 🎲`,
                            inline: false,
                        },
                        {
                            name: "📄 Motivo",
                            value: setorSelecionado,
                            inline: false,
                        },
                        {
                            name: "👮 Staff",
                            value: "Ninguém reivindicou esse ticket!",
                            inline: false,
                        },
                    )
                    .setColor(0x5865f2)
                    .setFooter({ text: "Powered by 7M" })
                    .setTimestamp();

                const row = buildTicketControls();

                const mentionRoles =
                    panelConfig.supportRoles &&
                    panelConfig.supportRoles.length > 0
                        ? panelConfig.supportRoles
                              .map((roleId) => `<@&${roleId}>`)
                              .join(" ")
                        : `<@&${panelConfig.supportRoleId}>`;

                const controlMessage = await ticketChannel.send({
                    content: `${interaction.user} ${mentionRoles}`,
                    embeds: [ticketEmbed],
                    components: [row],
                });

                const metadata = ticketMetadata.get(ticketChannel.id);
                if (metadata) {
                    metadata.controlMessageId = controlMessage.id;
                }

                const goToTicketButton = new ButtonBuilder()
                    .setLabel("Go to Ticket")
                    .setEmoji("<:emoji_1:1439056403934351571>")
                    .setStyle(ButtonStyle.Link)
                    .setURL(
                        `https://discord.com/channels/${interaction.guildId}/${ticketChannel.id}`,
                    );

                const buttonRow = new ActionRowBuilder().addComponents(
                    goToTicketButton,
                );

                await interaction.editReply({
                    content: "✅ Your ticket has been created!",
                    components: [buttonRow],
                });

                console.log(
                    `✅ Ticket criado: ${ticketChannelName} por ${interaction.user.tag} - Painel: ${panelConfig.name} - Setor: ${setorSelecionado}`,
                );

                if (panelConfig.logsChannelId) {
                    const logsChannel = interaction.guild.channels.cache.get(
                        panelConfig.logsChannelId,
                    );
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle("📂 Ticket Aberto")
                            .setDescription(
                                `**Usuário:** ${interaction.user} (${interaction.user.tag})\n**ID:** ${interaction.user.id}\n**Painel:** ${panelConfig.name}\n**Setor:** ${setorSelecionado}\n**Canal:** ${ticketChannel}\n**Horário:** <t:${Math.floor(Date.now() / 1000)}:F>`,
                            )
                            .setColor(0x00ff00)
                            .setFooter({ text: "Powered by 7M Store" })
                            .setTimestamp();

                        await logsChannel
                            .send({ embeds: [logEmbed] })
                            .catch((err) => {
                                console.error(
                                    "❌ Erro ao enviar log de ticket aberto:",
                                    err,
                                );
                            });
                    }
                }
            } catch (error) {
                console.error("❌ Erro ao criar ticket:", error);
                return interaction.followUp({
                    content: `❌ Erro ao criar o ticket: ${error.message}`,
                    ephemeral: true,
                });
            }
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === "modal_notify_user") {
            const context = getTicketContext(interaction.channelId);
            if (!context) {
                return interaction.reply({
                    content:
                        "❌ Não foi possível recuperar as informações deste ticket!",
                    ephemeral: true,
                });
            }

            const message =
                interaction.fields.getTextInputValue("notify_message");

            try {
                const user = await client.users.fetch(context.userId);
                await user.send({
                    content: `📧 **Mensagem da equipe de suporte:**\n\n${message}\n\n*Ticket: ${interaction.channel.name}*`,
                });

                await interaction.reply({
                    content: `✅ Mensagem enviada com sucesso para ${user.tag}!`,
                    ephemeral: true,
                });
            } catch (error) {
                console.error("Erro ao enviar DM:", error);
                await interaction.reply({
                    content:
                        "❌ Não foi possível enviar a mensagem. O usuário pode ter DMs desativadas.",
                    ephemeral: true,
                });
            }
        }

    }
});

const app = express();
const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
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
                    <div class="info">Bot Status: ${client.user ? "Online ✅" : "Offline ❌"}</div>
                    <div class="info">Bot Name: ${client.user ? client.user.tag : "N/A"}</div>
                    <div class="info">Servers: ${client.guilds ? client.guilds.cache.size : "0"}</div>
                    <div class="info">Uptime: ${process.uptime().toFixed(0)}s</div>
                    <p style="margin-top: 30px; color: #8b949e;">Powered by 7M Store</p>
                </div>
            </body>
        </html>
    `);
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Servidor HTTP rodando na porta ${PORT}`);
    console.log(`🔗 Keep-alive ativado para evitar hibernação`);
}).on("error", (err) => {
    if (err.code === "EADDRINUSE") {
        console.warn(
            `⚠️  Porta ${PORT} já está em uso. Tentando porta alternativa...`,
        );
        const altPort = PORT + 1;
        app.listen(altPort, "0.0.0.0", () => {
            console.log(`🌐 Servidor HTTP rodando na porta ${altPort}`);
        });
    } else {
        console.error("❌ Erro no servidor HTTP:", err);
    }
});

if (!checkEnvironmentVariables()) {
    console.error("⚠️  Bot não pode iniciar sem as variáveis de ambiente!");
    console.error(
        "   Crie um arquivo .env com TOKEN e CLIENT_ID do seu bot Discord.",
    );
    process.exit(1);
}

client.login(process.env.TOKEN).catch((err) => {
    console.error("❌ Erro ao fazer login no Discord:", err);
    console.error("⚠️  Verifique se o TOKEN no arquivo .env está correto!");
    process.exit(1);
});
