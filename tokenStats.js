/* tokenStats.js
 *
 * Token 统计模块
 * 用于读取和分析 Claude Code 的使用数据
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/**
 * Token 统计数据结构
 */
export class TokenStats {
    constructor() {
        this.totalCost = 0.0;
        this.totalTokens = 0;
        this.totalInputTokens = 0;
        this.totalOutputTokens = 0;
        this.totalCacheCreationTokens = 0;
        this.totalCacheReadTokens = 0;
        this.totalSessions = 0;
        this.lastUpdated = null;
    }

    /**
     * 格式化显示数字
     */
    static formatNumber(num) {
        if (num >= 1_000_000) {
            return `${(num / 1_000_000).toFixed(2)}M`;
        } else if (num >= 1_000) {
            return `${(num / 1_000).toFixed(1)}K`;
        }
        return num.toLocaleString();
    }

    /**
     * 格式化显示成本
     */
    static formatCurrency(amount) {
        return `$${amount.toFixed(4)}`;
    }
}

/**
 * Token 统计管理器
 */
export class TokenStatsManager {
    constructor() {
        this.claudePath = this._getClaudePath();
        this.projectsPath = GLib.build_filenamev([this.claudePath, 'projects']);
        
        // Claude 模型价格表 (每百万 tokens)
        this.modelPrices = {
            // Claude 4
            'claude-4-opus': { input: 15.0, output: 75.0, cacheWrite: 18.75, cacheRead: 1.50 },
            'claude-opus-4': { input: 15.0, output: 75.0, cacheWrite: 18.75, cacheRead: 1.50 },
            'claude-4-sonnet': { input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.30 },
            'claude-sonnet-4': { input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.30 },
            
            // Claude 3.5
            'claude-3.5-sonnet': { input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.30 },
            'claude-sonnet-3.5': { input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.30 },
            'claude-3.5-haiku': { input: 0.80, output: 4.0, cacheWrite: 1.0, cacheRead: 0.08 },
            'claude-haiku-3.5': { input: 0.80, output: 4.0, cacheWrite: 1.0, cacheRead: 0.08 }
        };
    }

    /**
     * 获取 Claude 配置目录路径
     */
    _getClaudePath() {
        const homeDir = GLib.get_home_dir();
        return GLib.build_filenamev([homeDir, '.claude']);
    }

    /**
     * 检查 Claude 目录是否存在
     */
    _claudeDirectoryExists() {
        const claudeDir = Gio.File.new_for_path(this.claudePath);
        const projectsDir = Gio.File.new_for_path(this.projectsPath);
        return claudeDir.query_exists(null) && projectsDir.query_exists(null);
    }

    /**
     * 获取模型价格信息
     */
    _getModelPrices(modelName) {
        // 遍历已知模型，寻找匹配的价格
        for (const [key, prices] of Object.entries(this.modelPrices)) {
            if (modelName.includes(key) || key.includes(modelName)) {
                return prices;
            }
        }
        
        // 如果没有找到匹配的模型，返回默认价格（避免统计错误）
        return { input: 0.0, output: 0.0, cacheWrite: 0.0, cacheRead: 0.0 };
    }

    /**
     * 计算单个条目的成本
     */
    _calculateCost(model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens) {
        const prices = this._getModelPrices(model);
        
        const cost = (inputTokens * prices.input / 1_000_000) +
                    (outputTokens * prices.output / 1_000_000) +
                    (cacheCreationTokens * prices.cacheWrite / 1_000_000) +
                    (cacheReadTokens * prices.cacheRead / 1_000_000);
        
        return cost;
    }

    /**
     * 解析 JSONL 文件
     */
    _parseJsonlFile(filePath) {
        const entries = [];
        
        try {
            const file = Gio.File.new_for_path(filePath);
            if (!file.query_exists(null)) {
                return entries;
            }

            const [success, contents] = file.load_contents(null);
            if (!success) {
                return entries;
            }

            const decoder = new TextDecoder('utf-8');
            const content = decoder.decode(contents);
            const lines = content.split('\n');

            const processedIds = new Set(); // 用于去重

            for (const line of lines) {
                if (!line.trim()) continue;

                try {
                    const jsonData = JSON.parse(line);
                    
                    // 检查是否包含使用统计信息
                    if (jsonData.message && jsonData.message.usage) {
                        const usage = jsonData.message.usage;
                        const messageId = jsonData.message.id;
                        
                        // 去重：避免重复统计同一条消息
                        if (messageId && processedIds.has(messageId)) {
                            continue;
                        }
                        if (messageId) {
                            processedIds.add(messageId);
                        }

                        const inputTokens = usage.input_tokens || 0;
                        const outputTokens = usage.output_tokens || 0;
                        const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
                        const cacheReadTokens = usage.cache_read_input_tokens || 0;

                        // 跳过没有实际 token 使用的条目
                        if (inputTokens === 0 && outputTokens === 0 && 
                            cacheCreationTokens === 0 && cacheReadTokens === 0) {
                            continue;
                        }

                        const model = jsonData.message.model || 'unknown';
                        const timestamp = jsonData.timestamp;
                        const sessionId = jsonData.sessionId || 'unknown';

                        const cost = this._calculateCost(model, inputTokens, outputTokens, 
                                                       cacheCreationTokens, cacheReadTokens);

                        entries.push({
                            timestamp,
                            model,
                            inputTokens,
                            outputTokens,
                            cacheCreationTokens,
                            cacheReadTokens,
                            cost,
                            sessionId
                        });
                    }
                } catch (e) {
                    // 忽略解析错误的行
                    console.debug('Failed to parse JSONL line:', e);
                }
            }
        } catch (e) {
            console.error('Failed to read JSONL file:', filePath, e);
        }

        return entries;
    }

    /**
     * 扫描所有项目目录，收集统计数据
     */
    _collectAllEntries() {
        const allEntries = [];
        
        try {
            const projectsDir = Gio.File.new_for_path(this.projectsPath);
            if (!projectsDir.query_exists(null)) {
                return allEntries;
            }

            const enumerator = projectsDir.enumerate_children(
                'standard::name,standard::type',
                Gio.FileQueryInfoFlags.NONE,
                null
            );

            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                    const projectName = info.get_name();
                    const projectPath = GLib.build_filenamev([this.projectsPath, projectName]);
                    
                    // 递归查找 .jsonl 文件
                    this._scanDirectory(projectPath, allEntries);
                }
            }
        } catch (e) {
            console.error('Failed to scan projects directory:', e);
        }

        return allEntries;
    }

    /**
     * 递归扫描目录查找 .jsonl 文件
     */
    _scanDirectory(dirPath, entries) {
        try {
            const dir = Gio.File.new_for_path(dirPath);
            if (!dir.query_exists(null)) {
                return;
            }

            const enumerator = dir.enumerate_children(
                'standard::name,standard::type',
                Gio.FileQueryInfoFlags.NONE,
                null
            );

            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                const fileName = info.get_name();
                const filePath = GLib.build_filenamev([dirPath, fileName]);

                if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                    // 递归扫描子目录
                    this._scanDirectory(filePath, entries);
                } else if (fileName.endsWith('.jsonl')) {
                    // 解析 JSONL 文件
                    const fileEntries = this._parseJsonlFile(filePath);
                    entries.push(...fileEntries);
                }
            }
        } catch (e) {
            console.debug('Failed to scan directory:', dirPath, e);
        }
    }

    /**
     * 获取 token 统计信息
     */
    getTokenStats() {
        const stats = new TokenStats();

        if (!this._claudeDirectoryExists()) {
            console.debug('Claude directory not found, returning empty stats');
            return stats;
        }

        try {
            const allEntries = this._collectAllEntries();
            
            if (allEntries.length === 0) {
                console.debug('No usage entries found');
                return stats;
            }

            // 统计唯一会话数
            const uniqueSessions = new Set();

            // 累计统计
            for (const entry of allEntries) {
                stats.totalCost += entry.cost;
                stats.totalInputTokens += entry.inputTokens;
                stats.totalOutputTokens += entry.outputTokens;
                stats.totalCacheCreationTokens += entry.cacheCreationTokens;
                stats.totalCacheReadTokens += entry.cacheReadTokens;
                
                uniqueSessions.add(entry.sessionId);
            }

            stats.totalTokens = stats.totalInputTokens + stats.totalOutputTokens + 
                              stats.totalCacheCreationTokens + stats.totalCacheReadTokens;
            stats.totalSessions = uniqueSessions.size;
            stats.lastUpdated = new Date().toISOString();

            console.log(`Token stats: ${stats.totalTokens} tokens, ${stats.totalSessions} sessions, $${stats.totalCost.toFixed(4)} cost`);

        } catch (e) {
            console.error('Failed to calculate token stats:', e);
        }

        return stats;
    }

    /**
     * 异步获取 token 统计信息
     */
    async getTokenStatsAsync() {
        return new Promise((resolve) => {
            // 使用 GLib.idle_add 在空闲时执行，避免阻塞UI
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                const stats = this.getTokenStats();
                resolve(stats);
                return GLib.SOURCE_REMOVE;
            });
        });
    }
}