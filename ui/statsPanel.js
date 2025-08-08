import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {TokenStatsManager, TokenStats} from '../tokenStats.js';

/**
 * 统计仪表盘UI组件
 * 负责显示Token使用统计、成本和会话信息
 */
export class StatsPanel {
    constructor(extensionPath) {
        this.extensionPath = extensionPath;
        this.tokenStatsManager = new TokenStatsManager();
        this.parentWindow = null; // 添加父窗口引用
        this.statsWidgets = {
            totalCostLabel: null,
            totalSessionsLabel: null,
            totalTokensLabel: null,
            lastUpdatedLabel: null,
            refreshButton: null
        };
    }

    /**
     * 设置父窗口引用
     */
    setParentWindow(parentWindow) {
        this.parentWindow = parentWindow;
    }

    /**
     * 创建统计仪表盘组
     */
    createStatsGroup() {
        const statsGroup = new Adw.PreferencesGroup({
            title: _('INFO'),
            description: _('View your Claude Code API usage and costs'),
        });

        // 创建统计卡片的网格布局
        const statsGrid = new Gtk.Grid({
            row_spacing: 12,
            column_spacing: 12,
            column_homogeneous: true,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        // 总成本卡片
        const costBox = this._createStatsCard(
            _('Total Cost'),
            '$0.0000',
            'img/icons/cash.svg'
        );
        this.statsWidgets.totalCostLabel = costBox.get_last_child().get_first_child().get_next_sibling();
        statsGrid.attach(costBox, 0, 0, 1, 1);

        // 总会话数卡片（可点击按钮）
        const sessionsButton = this._createClickableStatsCard(
            _('Total Sessions'),
            '0',
            'img/icons/archive-fill.svg',
            () => this._showSessionsDetailDialog()
        );
        this.statsWidgets.totalSessionsLabel = sessionsButton._valueLabel;
        statsGrid.attach(sessionsButton, 1, 0, 1, 1);

        // 总令牌数卡片
        const tokensBox = this._createStatsCard(
            _('Total Tokens'),
            '0',
            'img/icons/claude.svg'
        );
        this.statsWidgets.totalTokensLabel = tokensBox.get_last_child().get_first_child().get_next_sibling();
        statsGrid.attach(tokensBox, 2, 0, 1, 1);

        // 创建包装器
        const statsWrapper = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
        });
        statsWrapper.append(statsGrid);

        // 添加刷新按钮和最后更新时间
        const controlsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
        });

        this.statsWidgets.refreshButton = new Gtk.Button({
            label: _('Refresh Stats'),
        });

        this.statsWidgets.lastUpdatedLabel = new Gtk.Label({
            label: _('Not loaded yet'),
        });

        controlsBox.append(this.statsWidgets.refreshButton);
        controlsBox.append(this.statsWidgets.lastUpdatedLabel);
        
        statsWrapper.append(controlsBox);

        // 创建包含统计内容的行
        const statsRow = new Adw.ActionRow();
        statsRow.set_child(statsWrapper);
        statsGroup.add(statsRow);

        // 连接刷新按钮事件
        this.statsWidgets.refreshButton.connect('clicked', () => {
            this._refreshTokenStats();
        });

        // 初始加载统计数据
        this._refreshTokenStats();

        return statsGroup;
    }

    /**
     * 创建统计卡片
     */
    _createStatsCard(title, value, iconPath) {
        const cardBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 8,
            margin_end: 8,
        });

        // 图标
        let icon;
        if (iconPath.startsWith('img/')) {
            const fullPath = GLib.build_filenamev([this.extensionPath, iconPath]);
            icon = new Gtk.Image({
                gicon: Gio.icon_new_for_string(fullPath),
                pixel_size: 32,
            });
        } else {
            icon = new Gtk.Image({
                icon_name: iconPath,
                pixel_size: 32,
            });
        }

        // 文本容器
        const textBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            valign: Gtk.Align.CENTER,
            hexpand: true,
        });

        const titleLabel = new Gtk.Label({
            label: title,
            halign: Gtk.Align.START,
        });

        const valueLabel = new Gtk.Label({
            label: value,
            halign: Gtk.Align.START,
        });

        textBox.append(titleLabel);
        textBox.append(valueLabel);

        cardBox.append(icon);
        cardBox.append(textBox);

        return cardBox;
    }

    /**
     * 创建可点击的统计卡片
     */
    _createClickableStatsCard(title, value, iconPath, clickCallback) {
        const cardButton = new Gtk.Button({
            css_classes: ['flat'],
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 8,
            margin_end: 8,
        });

        const cardBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
        });

        // 图标
        let icon;
        if (iconPath.startsWith('img/')) {
            const fullPath = GLib.build_filenamev([this.extensionPath, iconPath]);
            icon = new Gtk.Image({
                gicon: Gio.icon_new_for_string(fullPath),
                pixel_size: 32,
            });
        } else {
            icon = new Gtk.Image({
                icon_name: iconPath,
                pixel_size: 32,
            });
        }

        // 文本容器
        const textBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            valign: Gtk.Align.CENTER,
            hexpand: true,
        });

        const titleLabel = new Gtk.Label({
            label: title,
            halign: Gtk.Align.START,
        });

        const valueLabel = new Gtk.Label({
            label: value,
            halign: Gtk.Align.START,
        });

        textBox.append(titleLabel);
        textBox.append(valueLabel);

        cardBox.append(icon);
        cardBox.append(textBox);
        
        cardButton.set_child(cardBox);

        // 连接点击事件
        if (clickCallback) {
            cardButton.connect('clicked', clickCallback);
        }

        // 将valueLabel作为属性存储在按钮上
        cardButton._valueLabel = valueLabel;

        return cardButton;
    }

    /**
     * 刷新 Token 统计数据
     */
    async _refreshTokenStats() {
        // 设置刷新按钮为加载状态
        this.statsWidgets.refreshButton.set_sensitive(false);
        this.statsWidgets.refreshButton.set_label(_('Loading...'));
        this.statsWidgets.lastUpdatedLabel.set_label(_('Fetching data...'));

        try {
            // 异步获取统计数据
            const stats = await this.tokenStatsManager.getTokenStatsAsync();
            
            // 更新界面
            this.statsWidgets.totalCostLabel.set_label(TokenStats.formatCurrency(stats.totalCost));
            this.statsWidgets.totalSessionsLabel.set_label(stats.totalSessions.toString());
            this.statsWidgets.totalTokensLabel.set_label(TokenStats.formatNumber(stats.totalTokens));
            
            const now = new Date();
            const timeStr = now.toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            this.statsWidgets.lastUpdatedLabel.set_label(_('Last updated: ') + timeStr);

            console.log('Token stats refreshed successfully');
        } catch (error) {
            console.error('Failed to refresh token stats:', error);
            this.statsWidgets.totalCostLabel.set_label(_('Failed to load'));
            this.statsWidgets.totalSessionsLabel.set_label(_('Error'));
            this.statsWidgets.totalTokensLabel.set_label(_('Error'));
            this.statsWidgets.lastUpdatedLabel.set_label(_('Failed to load'));
        } finally {
            // 恢复刷新按钮状态
            this.statsWidgets.refreshButton.set_sensitive(true);
            this.statsWidgets.refreshButton.set_label(_('Refresh Stats'));
        }
    }

    /**
     * 显示会话详情对话框
     * 将使用 SessionDetailDialog 来处理
     */
    async _showSessionsDetailDialog() {
        // 动态导入会话详情模块
        const { SessionDetailDialog } = await import('../ui/sessionDialog.js');
        const dialog = new SessionDetailDialog(this.extensionPath, this.tokenStatsManager);
        dialog.show(this.parentWindow);
    }
}