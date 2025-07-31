/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, _('Claude Code Switcher'));
        this._extension = extension;
        this._settings = extension.getSettings();

        this.add_child(new St.Icon({
            icon_name: 'face-smile-symbolic',
            style_class: 'system-status-icon',
        }));

        // 构建菜单
        this._buildMenu();

        // 监听设置变化
        this._settings.connect('changed::api-providers', () => {
            this._rebuildMenu();
        });
        this._settings.connect('changed::current-provider', () => {
            this._updateCurrentProvider();
        });
    }

    _buildMenu() {
        // 清空现有菜单
        this.menu.removeAll();

        // 添加API提供商列表
        this._addProviderMenuItems();

        // 添加分隔符
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 添加"Add more.."按钮
        let addMoreItem = new PopupMenu.PopupMenuItem(_('Add more..'));
        addMoreItem.connect('activate', () => {
            this._openPreferences();
        });
        this.menu.addMenuItem(addMoreItem);
    }

    _addProviderMenuItems() {
        try {
            const providersJson = this._settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            const currentProvider = this._settings.get_string('current-provider');

            if (providers.length === 0) {
                // 如果没有配置提供商，显示提示
                let noProvidersItem = new PopupMenu.PopupMenuItem(_('暂无配置的提供商'));
                noProvidersItem.setSensitive(false);
                this.menu.addMenuItem(noProvidersItem);
                return;
            }

            // 为每个提供商创建菜单项
            providers.forEach(provider => {
                let item = new PopupMenu.PopupMenuItem(provider.name);
                
                // 如果是当前选中的提供商，添加勾选标记
                if (provider.name === currentProvider) {
                    item.setOrnament(PopupMenu.Ornament.CHECK);
                }

                item.connect('activate', () => {
                    this._selectProvider(provider.name);
                });

                this.menu.addMenuItem(item);
            });
        } catch (e) {
            console.log('加载API提供商失败:', e);
            let errorItem = new PopupMenu.PopupMenuItem(_('加载提供商失败'));
            errorItem.setSensitive(false);
            this.menu.addMenuItem(errorItem);
        }
    }

    _selectProvider(providerName) {
        // 检查提供商是否有API密钥
        if (this._checkProviderKey(providerName)) {
            this._settings.set_string('current-provider', providerName);
            // 同步配置到本地文件
            this._extension.syncToLocalFile();
            Main.notify(_(`已切换到: ${providerName}`));
        } else {
            // 显示配置API密钥的提示
            this._showConfigureKeyNotification(providerName);
        }
    }

    _checkProviderKey(providerName) {
        try {
            const providersJson = this._settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            
            const provider = providers.find(p => p.name === providerName);
            return provider && provider.key && provider.key.trim() !== '';
        } catch (e) {
            console.log('检查API密钥失败:', e);
            return false;
        }
    }

    _showConfigureKeyNotification(providerName) {
        if (providerName.includes('Anthropic') || providerName.includes('默认')) {
            Main.notify(_('请先配置 Anthropic API 密钥'), _('点击"Add more.."按钮打开设置界面，为 Anthropic 提供商配置官方 API 密钥后即可使用。'));
        } else {
            Main.notify(_(`请先配置 ${providerName} API 密钥`), _('点击"Add more.."按钮打开设置界面，为此提供商配置 API 密钥后即可使用。'));
        }
    }

    _rebuildMenu() {
        this._buildMenu();
    }

    _updateCurrentProvider() {
        // 重新构建菜单以更新勾选状态
        this._rebuildMenu();
    }

    _openPreferences() {
        if (this._extension && this._extension.openPreferences) {
            this._extension.openPreferences();
        }
    }
});

export default class IndicatorExampleExtension extends Extension {
    enable() {
        this._indicator = new Indicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        
        // 监听设置变化，同步到本地文件
        this._settings = this.getSettings();
        this._settingsChangedIds = [];
        
        // 监听各种设置变化
        this._settingsChangedIds.push(
            this._settings.connect('changed::current-provider', () => {
                this.syncToLocalFile();
            })
        );
        this._settingsChangedIds.push(
            this._settings.connect('changed::auto-update', () => {
                this.syncToLocalFile();
            })
        );
        this._settingsChangedIds.push(
            this._settings.connect('changed::proxy-host', () => {
                this.syncToLocalFile();
            })
        );
        this._settingsChangedIds.push(
            this._settings.connect('changed::proxy-port', () => {
                this.syncToLocalFile();
            })
        );
        
        // 初始化时同步一次
        this.syncToLocalFile();
    }

    disable() {
        // 断开设置监听
        if (this._settingsChangedIds) {
            this._settingsChangedIds.forEach(id => {
                this._settings.disconnect(id);
            });
            this._settingsChangedIds = null;
        }
        
        this._indicator.destroy();
        this._indicator = null;
        this._settings = null;
    }
    
    /**
     * 获取Claude配置文件路径 ~/.claude/settings.json
     */
    _getClaudeConfigPath() {
        const homeDir = GLib.get_home_dir();
        const claudeDir = GLib.build_filenamev([homeDir, '.claude']);
        return GLib.build_filenamev([claudeDir, 'settings.json']);
    }
    
    /**
     * 确保Claude配置目录存在
     */
    _ensureClaudeDir() {
        const homeDir = GLib.get_home_dir();
        const claudeDir = GLib.build_filenamev([homeDir, '.claude']);
        const dir = Gio.File.new_for_path(claudeDir);
        
        if (!dir.query_exists(null)) {
            try {
                dir.make_directory(null);
                console.log('创建Claude配置目录:', claudeDir);
            } catch (e) {
                console.error('创建Claude配置目录失败:', e);
                return false;
            }
        }
        return true;
    }
    
    /**
     * 读取现有的settings.json文件 (异步)
     */
    async _readExistingConfig() {
        const configPath = this._getClaudeConfigPath();
        const file = Gio.File.new_for_path(configPath);
        
        if (!file.query_exists(null)) {
            return null;
        }
        
        try {
            const [contents] = await new Promise((resolve, reject) => {
                file.load_contents_async(null, (file, result) => {
                    try {
                        const [success, contents] = file.load_contents_finish(result);
                        if (success) {
                            resolve([contents]);
                        } else {
                            reject(new Error('Failed to read file'));
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            
            const decoder = new TextDecoder('utf-8');
            const jsonString = decoder.decode(contents);
            return JSON.parse(jsonString);
        } catch (e) {
            console.error('读取Claude配置文件失败:', e);
        }
        
        return null;
    }
    
    /**
     * 获取当前选中的提供商信息
     */
    _getCurrentProviderInfo() {
        try {
            const providersJson = this._settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            const currentProviderName = this._settings.get_string('current-provider');
            
            if (!currentProviderName) {
                return null;
            }
            
            return providers.find(p => p.name === currentProviderName);
        } catch (e) {
            console.error('获取当前提供商信息失败:', e);
            return null;
        }
    }
    
    /**
     * 生成标准的Claude配置对象 (异步)
     */
    async _generateClaudeConfig() {
        const currentProvider = this._getCurrentProviderInfo();
        const autoUpdate = this._settings.get_boolean('auto-update');
        const proxyHost = this._settings.get_string('proxy-host');
        const proxyPort = this._settings.get_string('proxy-port');
        
        // 构建代理URL
        let proxyUrl = '';
        if (proxyHost) {
            proxyUrl = proxyPort ? `${proxyHost}:${proxyPort}` : proxyHost;
            if (!proxyUrl.startsWith('http://') && !proxyUrl.startsWith('https://')) {
                proxyUrl = `http://${proxyUrl}`;
            }
        }
        
        // 读取现有配置以保留其他字段
        const existingConfig = await this._readExistingConfig() || {};
        
        const config = {
            env: {
                ANTHROPIC_AUTH_TOKEN: currentProvider ? currentProvider.key : '',
                ANTHROPIC_BASE_URL: currentProvider ? currentProvider.url : '',
                ANTHROPIC_MODEL: currentProvider ? (currentProvider.largeModel || '') : '',
                ANTHROPIC_SMALL_FAST_MODEL: currentProvider ? (currentProvider.smallModel || '') : '',
                DISABLE_AUTOUPDATER: autoUpdate ? '0' : '1', // 注意：0表示不禁用，1表示禁用
                HTTPS_PROXY: proxyUrl,
                HTTP_PROXY: proxyUrl
            },
            permissions: existingConfig.permissions || {
                allow: [],
                deny: []
            },
            feedbackSurveyState: existingConfig.feedbackSurveyState || {
                lastShownTime: Date.now()
            }
        };
        
        return config;
    }
    
    /**
     * 同步配置到本地Claude配置文件 (异步)
     */
    async syncToLocalFile() {
        if (!this._ensureClaudeDir()) {
            return;
        }
        
        const configPath = this._getClaudeConfigPath();
        const config = await this._generateClaudeConfig();
        
        try {
            const jsonString = JSON.stringify(config, null, 2);
            const file = Gio.File.new_for_path(configPath);
            
            const encoder = new TextEncoder();
            const bytes = encoder.encode(jsonString);
            
            file.replace_contents(
                bytes,
                null, // etag
                false, // make_backup
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null // cancellable
            );
            
            console.log('已同步配置到Claude配置文件:', configPath);
        } catch (e) {
            console.error('写入Claude配置文件失败:', e);
        }
    }
}
