import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {TokenStats} from '../lib/tokenStats.js';

/**
 * 会话详情对话框
 * 负责显示会话详情和消息内容
 */
export class SessionDetailDialog {
    constructor(extensionPath, tokenStatsManager) {
        this.extensionPath = extensionPath;
        this.tokenStatsManager = tokenStatsManager;
        this.window = null;
    }

    /**
     * 显示会话详情对话框
     */
    async show(parentWindow) {
        const dialog = new Adw.Window({
            transient_for: parentWindow,
            modal: true,
            title: _('Sessions Detail (Beta)'),
            default_width: 800,
            default_height: 600,
        });

        const toolbarView = new Adw.ToolbarView();
        const headerBar = new Adw.HeaderBar();
        toolbarView.add_top_bar(headerBar);

        // 创建滚动窗口
        const scrolledWindow = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            hexpand: true,
            vexpand: true,
        });

        // 创建主容器
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        // 加载状态指示器
        const loadingBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER,
        });

        const spinner = new Gtk.Spinner({
            spinning: true,
            width_request: 32,
            height_request: 32,
        });

        const loadingLabel = new Gtk.Label({
            label: _('Loading session data...'),
        });

        loadingBox.append(spinner);
        loadingBox.append(loadingLabel);
        mainBox.append(loadingBox);

        scrolledWindow.set_child(mainBox);
        toolbarView.set_content(scrolledWindow);
        dialog.set_content(toolbarView);

        // 显示对话框
        dialog.present();

        try {
            // 异步加载会话数据
            const sessionsDetail = await this.tokenStatsManager.getSessionsDetailAsync();
            
            // 移除加载指示器
            mainBox.remove(loadingBox);

            if (sessionsDetail.length === 0) {
                const emptyLabel = new Gtk.Label({
                    label: _('No session data found'),
                    valign: Gtk.Align.CENTER,
                    halign: Gtk.Align.CENTER,
                });
                mainBox.append(emptyLabel);
                return;
            }

            // 创建会话列表
            const sessionsList = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 12,
            });

            for (const session of sessionsDetail) {
                const sessionCard = this._createSessionCard(session, dialog);
                sessionsList.append(sessionCard);
            }

            mainBox.append(sessionsList);

        } catch (error) {
            console.error('Failed to load sessions detail:', error);
            
            // 移除加载指示器
            mainBox.remove(loadingBox);
            
            const errorLabel = new Gtk.Label({
                label: _('Failed to load session data'),
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.CENTER,
            });
            mainBox.append(errorLabel);
        }
    }

    /**
     * 创建会话卡片
     */
    _createSessionCard(session, parentWindow) {
        // 创建展开行
        const sessionRow = new Adw.ExpanderRow({
            title: `Session ${session.sessionId.substring(0, 8)}...`,
            subtitle: `${TokenStats.formatCurrency(session.totalCost)} • ${session.messageCount} messages • ${TokenStats.formatNumber(session.totalTokens)} tokens`,
        });

        // 会话基本信息
        const infoGroup = new Adw.PreferencesGroup();
        
        // 会话ID
        const sessionIdRow = new Adw.ActionRow({
            title: _('Session ID'),
            subtitle: session.sessionId,
        });
        infoGroup.add(sessionIdRow);

        // 时间范围
        const timeRangeRow = new Adw.ActionRow({
            title: _('Time Range'),
            subtitle: `${new Date(session.firstTimestamp).toLocaleString()} - ${new Date(session.lastTimestamp).toLocaleString()}`,
        });
        infoGroup.add(timeRangeRow);

        // 使用的模型
        const modelsRow = new Adw.ActionRow({
            title: _('Models Used'),
            subtitle: session.models.join(', '),
        });
        infoGroup.add(modelsRow);

        // Token详细信息
        const tokenDetailsRow = new Adw.ActionRow({
            title: _('Token Details'),
            subtitle: `Input: ${TokenStats.formatNumber(session.totalInputTokens)} • Output: ${TokenStats.formatNumber(session.totalOutputTokens)} • Cache: ${TokenStats.formatNumber(session.totalCacheCreationTokens + session.totalCacheReadTokens)}`,
        });
        infoGroup.add(tokenDetailsRow);

        // 添加"查看会话"按钮行
        const viewSessionRow = new Adw.ActionRow({
            title: _('Actions'),
        });
        
        const viewSessionButton = new Gtk.Button({
            label: _('View Session'),
            css_classes: ['suggested-action'],
            valign: Gtk.Align.CENTER,
        });
        
        viewSessionButton.connect('clicked', () => {
            this._showSessionContentDialog(session.sessionId, parentWindow);
        });
        
        viewSessionRow.add_suffix(viewSessionButton);
        infoGroup.add(viewSessionRow);

        // 将信息组添加到展开行中
        sessionRow.add_row(infoGroup);

        return sessionRow;
    }

    /**
     * 显示会话内容对话框
     */
    async _showSessionContentDialog(sessionId, parentWindow) {
        const dialog = new Adw.Window({
            transient_for: parentWindow,
            modal: true,
            title: _('Session Content'),
            default_width: 900,
            default_height: 700,
        });

        const toolbarView = new Adw.ToolbarView();
        const headerBar = new Adw.HeaderBar({
            title_widget: new Adw.WindowTitle({
                title: _('Session Content'),
                subtitle: `Session ID: ${sessionId.substring(0, 12)}...`,
            }),
        });
        toolbarView.add_top_bar(headerBar);

        // 创建滚动窗口
        const scrolledWindow = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            hexpand: true,
            vexpand: true,
        });

        // 创建主容器
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        // 创建消息列表容器
        const messagesList = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 16,
            hexpand: true,
        });

        // 进度指示器
        const progressContainer = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER,
        });

        const spinner = new Gtk.Spinner({
            spinning: true,
            width_request: 32,
            height_request: 32,
        });

        const progressLabel = new Gtk.Label({
            label: _('Loading session messages...'),
        });

        const progressBar = new Gtk.ProgressBar({
            width_request: 300,
            show_text: true,
        });

        progressContainer.append(spinner);
        progressContainer.append(progressLabel);
        progressContainer.append(progressBar);

        mainBox.append(progressContainer);
        mainBox.append(messagesList);
        scrolledWindow.set_child(mainBox);
        toolbarView.set_content(scrolledWindow);
        dialog.set_content(toolbarView);

        // 显示对话框
        dialog.present();

        try {
            // 异步分批加载消息
            await this._loadMessagesProgressively(sessionId, messagesList, progressContainer, progressLabel, progressBar);

        } catch (error) {
            console.error('Failed to load session messages:', error);
            
            // 移除进度指示器
            mainBox.remove(progressContainer);
            
            const errorLabel = new Gtk.Label({
                label: _('Failed to load session messages'),
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.CENTER,
            });
            mainBox.append(errorLabel);
        }
    }

    /**
     * 分批异步加载消息
     */
    async _loadMessagesProgressively(sessionId, messagesList, progressContainer, progressLabel, progressBar) {
        // 首先获取消息总数
        progressLabel.set_label(_('Analyzing messages...'));
        progressBar.set_fraction(0.1);
        
        const messages = await this.tokenStatsManager.getSessionMessagesAsync(sessionId);
        
        if (messages.length === 0) {
            progressContainer.get_parent().remove(progressContainer);
            const emptyLabel = new Gtk.Label({
                label: _('No messages found in this session'),
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.CENTER,
            });
            messagesList.append(emptyLabel);
            return;
        }

        const batchSize = 3;
        const totalBatches = Math.ceil(messages.length / batchSize);
        
        progressLabel.set_label(_('Loading messages...'));
        progressBar.set_fraction(0.2);

        // 分批处理消息
        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const startIndex = batchIndex * batchSize;
            const endIndex = Math.min(startIndex + batchSize, messages.length);
            const batchMessages = messages.slice(startIndex, endIndex);

            // 更新进度
            const progress = 0.2 + (batchIndex / totalBatches) * 0.7;
            progressBar.set_fraction(progress);
            progressLabel.set_label(_('Loading messages...') + ` (${endIndex}/${messages.length})`);

            // 创建消息卡片
            for (const message of batchMessages) {
                const messageCard = this._createMessageCard(message);
                messagesList.append(messageCard);
            }

            // 让UI有时间更新
            await this._yield();
        }

        // 完成加载
        progressBar.set_fraction(1.0);
        progressLabel.set_label(_('Loading complete') + ` - ${messages.length} messages loaded`);
        
        // 延迟移除进度指示器
        for (let i = 0; i < 30; i++) {
            await this._yield();
        }
        progressContainer.get_parent().remove(progressContainer);
    }

    /**
     * 异步处理函数，用于让出控制权给UI更新
     */
    _yield() {
        return new Promise(resolve => {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                resolve();
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    /**
     * 创建消息卡片
     */
    _createMessageCard(message) {
        // 根据消息角色选择不同的样式
        const cardCssClasses = ['card'];
        if (message.role === 'user') {
            cardCssClasses.push('user-message');
        } else if (message.role === 'assistant') {
            cardCssClasses.push('assistant-message');
        } else if (message.role === 'tool_result') {
            cardCssClasses.push('tool-result-message');
        }

        // 创建消息卡片
        const messageCard = new Gtk.Frame({
            margin_bottom: 8,
            css_classes: cardCssClasses,
            hexpand: true,
        });

        const cardBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
            hexpand: true,
        });

        // 消息头部
        const headerBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
        });

        // 角色标签
        const currentMessage = message.isVersioned ? message.versions[message.currentVersion] : message;
        const roleIcon = this._getRoleIcon(currentMessage.role);
        const roleLabel = new Gtk.Label({
            label: `${roleIcon} ${this._formatRole(currentMessage.role)}`,
            css_classes: ['heading'],
            halign: Gtk.Align.START,
            use_markup: true,
        });

        // 时间标签
        const timeLabel = new Gtk.Label({
            label: new Date(currentMessage.timestamp).toLocaleString(),
            css_classes: ['dim-label'],
            halign: Gtk.Align.END,
            hexpand: true,
        });

        headerBox.append(roleLabel);
        headerBox.append(timeLabel);
        cardBox.append(headerBox);

        // 模型信息（只对助手消息显示）
        if (currentMessage.model && currentMessage.role === 'assistant') {
            const modelLabel = new Gtk.Label({
                label: `📋 Model: ${currentMessage.model}`,
                css_classes: ['caption'],
                halign: Gtk.Align.START,
                use_markup: true,
            });
            cardBox.append(modelLabel);
        }

        // 消息内容
        const contentInfo = this._extractMessageContentWithDetails(currentMessage.content);
        if (contentInfo.text || contentInfo.hasComplexContent) {
            this._addMessageContent(cardBox, currentMessage, contentInfo);
        }

        // Token使用信息
        if (currentMessage.usage && Object.keys(currentMessage.usage).length > 0 && currentMessage.role === 'assistant') {
            const usageText = this._formatUsageInfo(currentMessage.usage);
            if (usageText) {
                const usageLabel = new Gtk.Label({
                    label: `🔢 ${usageText}`,
                    css_classes: ['caption', 'dim-label'],
                    halign: Gtk.Align.START,
                    use_markup: true,
                });
                cardBox.append(usageLabel);
            }
        }

        messageCard.set_child(cardBox);
        return messageCard;
    }

    /**
     * 获取角色图标
     */
    _getRoleIcon(role) {
        const roleIcons = {
            'user': '👤',
            'assistant': '🤖',
            'system': '⚙️',
            'tool_result': '🔧',
            'unknown': '❓'
        };
        return roleIcons[role] || '❓';
    }

    /**
     * 格式化角色名称
     */
    _formatRole(role) {
        const roleMap = {
            'user': _('User'),
            'assistant': _('Assistant'), 
            'system': _('System'),
            'tool_result': _('Tool Result'),
            'unknown': _('Unknown')
        };
        return roleMap[role] || role;
    }

    /**
     * 提取消息内容并分析详细信息
     */
    _extractMessageContentWithDetails(content) {
        if (!content) {
            return { text: '', hasComplexContent: false, items: [] };
        }

        if (typeof content === 'string') {
            return { 
                text: content, 
                hasComplexContent: false, 
                items: [{ type: 'text', text: content }] 
            };
        }

        if (!Array.isArray(content)) {
            const strContent = String(content);
            return { 
                text: strContent, 
                hasComplexContent: false, 
                items: [{ type: 'text', text: strContent }] 
            };
        }

        let text = '';
        let hasComplexContent = false;
        const items = [];

        for (const item of content) {
            items.push(item);
            
            if (item.type === 'text' && item.text) {
                text += item.text + '\n';
            } else if (item.type === 'tool_use') {
                hasComplexContent = true;
                text += `🔧 Tool Call: ${item.name}\n`;
            } else if (item.type === 'tool_result') {
                hasComplexContent = true;
                text += `🔧 Tool Result\n`;
            }
        }
        
        // 如果文本很长也认为是复杂内容
        if (text.length > 500) {
            hasComplexContent = true;
        }

        return { 
            text: text.trim(), 
            hasComplexContent, 
            items 
        };
    }

    /**
     * 添加消息内容到卡片
     */
    _addMessageContent(cardBox, message, contentInfo) {
        if (!contentInfo.hasComplexContent) {
            // 简单内容直接显示
            const contentLabel = new Gtk.Label({
                label: contentInfo.text,
                wrap: true,
                wrap_mode: Pango.WrapMode.WORD_CHAR,
                selectable: true,
                halign: Gtk.Align.FILL,
                valign: Gtk.Align.START,
                xalign: 0,
                css_classes: message.role === 'user' ? ['user-content'] : ['assistant-content'],
                hexpand: true,
            });
            contentLabel.set_size_request(-1, -1);
            cardBox.append(contentLabel);
        } else {
            // 复杂内容使用可折叠的展开行
            const expanderRow = new Adw.ExpanderRow({
                title: _('Message Content'),
                subtitle: this._getContentSummary(contentInfo.items),
            });

            const detailGroup = new Adw.PreferencesGroup();
            
            for (const item of contentInfo.items) {
                const itemRow = this._createContentItemRow(item, contentInfo.items);
                if (itemRow) {
                    detailGroup.add(itemRow);
                }
            }

            expanderRow.add_row(detailGroup);
            cardBox.append(expanderRow);
        }
    }

    /**
     * 获取内容摘要
     */
    _getContentSummary(items) {
        const summary = [];
        let textCount = 0;
        let toolCount = 0;
        let resultCount = 0;

        for (const item of items) {
            if (item.type === 'text') {
                textCount++;
            } else if (item.type === 'tool_use') {
                toolCount++;
            } else if (item.type === 'tool_result') {
                resultCount++;
            }
        }

        if (textCount > 0) summary.push(`${textCount} text`);
        if (toolCount > 0) summary.push(`${toolCount} tool calls`);
        if (resultCount > 0) summary.push(`${resultCount} results`);

        return summary.join(' • ');
    }

    /**
     * 创建内容项行
     */
    _createContentItemRow(item, allItems = []) {
        if (item.type === 'text' && item.text) {
            const textRow = new Adw.ExpanderRow({
                title: '📝 Text Content',
                subtitle: `${item.text.substring(0, 100)}${item.text.length > 100 ? '...' : ''}`,
            });

            const textLabel = new Gtk.Label({
                label: item.text,
                wrap: true,
                wrap_mode: Pango.WrapMode.WORD_CHAR,
                selectable: true,
                halign: Gtk.Align.FILL,
                valign: Gtk.Align.START,
                xalign: 0,
                margin_top: 8,
                margin_bottom: 8,
                margin_start: 8,
                margin_end: 8,
                hexpand: true,
            });

            const textGroup = new Adw.PreferencesGroup();
            const textActionRow = new Adw.ActionRow();
            textActionRow.set_child(textLabel);
            textGroup.add(textActionRow);
            textRow.add_row(textGroup);

            return textRow;
        }
        // 其他内容类型的处理逻辑...
        return null;
    }

    /**
     * 格式化使用信息
     */
    _formatUsageInfo(usage) {
        const parts = [];
        
        if (usage.input_tokens) {
            parts.push(`Input: ${TokenStats.formatNumber(usage.input_tokens)}`);
        }
        if (usage.output_tokens) {
            parts.push(`Output: ${TokenStats.formatNumber(usage.output_tokens)}`);
        }
        if (usage.cache_creation_input_tokens) {
            parts.push(`Cache Write: ${TokenStats.formatNumber(usage.cache_creation_input_tokens)}`);
        }
        if (usage.cache_read_input_tokens) {
            parts.push(`Cache Read: ${TokenStats.formatNumber(usage.cache_read_input_tokens)}`);
        }
        
        return parts.length > 0 ? `Tokens: ${parts.join(' • ')}` : '';
    }
}