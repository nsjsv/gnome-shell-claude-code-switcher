/* tokenStats.js
 *
 * Token 统计模块
 * 用于读取和分析 Claude Code 的使用数据
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'query_info_async');
Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async');

/**
 * @class TokenStats
 * @description Represents the data structure for token statistics.
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

        // 新增：按维度统计
        this.byModel = [];
        this.byDate = [];
        this.byProject = [];
    }

    /**
     * Formats a number for display (e.g., using K for thousands, M for millions).
     * @param {number} num - The number to format.
     * @returns {string} - The formatted string.
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
     * Formats a number as a currency string.
     * @param {number} amount - The amount to format.
     * @returns {string} - The formatted currency string (e.g., "$0.1234").
     */
    static formatCurrency(amount) {
        return `$${amount.toFixed(4)}`;
    }
}

/**
 * @class TokenStatsManager
 * @description Manages reading and processing token usage data from Claude Code logs.
 */
export class TokenStatsManager {
    constructor() {
        this.claudePath = this._getClaudePath();
        this.projectsPath = GLib.build_filenamev([this.claudePath, 'projects']);

        // Claude 模型价格表 (每百万 tokens) - 根据用户截图更新
        this.modelPrices = {
            // Claude 4.1
            'claude-opus-4.1': {
                input: 15.0,
                output: 75.0,
                cacheWrite: 18.75,
                cacheRead: 1.5,
            },
            'claude-4.1-opus': {
                input: 15.0,
                output: 75.0,
                cacheWrite: 18.75,
                cacheRead: 1.5,
            },

            // Claude 4
            'claude-opus-4': {
                input: 15.0,
                output: 75.0,
                cacheWrite: 18.75,
                cacheRead: 1.5,
            },
            'claude-sonnet-4': {
                input: 3.0,
                output: 15.0,
                cacheWrite: 3.75,
                cacheRead: 0.3,
            },

            // Claude 3.7
            'claude-sonnet-3.7': {
                input: 3.0,
                output: 15.0,
                cacheWrite: 3.75,
                cacheRead: 0.3,
            },

            // Claude 3.5
            'claude-sonnet-3.5': {
                input: 3.0,
                output: 15.0,
                cacheWrite: 3.75,
                cacheRead: 0.3,
            },
            'claude-haiku-3.5': {
                input: 0.8,
                output: 4.0,
                cacheWrite: 1.0,
                cacheRead: 0.08,
            },

            // Claude 3 (Opus is deprecated)
            'claude-opus-3': {
                input: 15.0,
                output: 75.0,
                cacheWrite: 18.75,
                cacheRead: 1.5,
            },
            'claude-haiku-3': {
                input: 0.25,
                output: 1.25,
                cacheWrite: 0.3,
                cacheRead: 0.03,
            },
        };
    }

    /**
     * Gets the path to the main ~/.claude directory.
     * @returns {string}
     * @private
     */
    _getClaudePath() {
        const homeDir = GLib.get_home_dir();
        return GLib.build_filenamev([homeDir, '.claude']);
    }

    /**
     * Checks if the required Claude log directories exist.
     * @returns {Promise<boolean>}
     * @private
     */
    async _claudeDirectoryExists() {
        try {
            const claudeDir = Gio.File.new_for_path(this.claudePath);
            const projectsDir = Gio.File.new_for_path(this.projectsPath);

            // 使用promisified方法检查目录
            try {
                await claudeDir.query_info_async(
                    'standard::type',
                    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                    GLib.PRIORITY_DEFAULT,
                    null
                );
            } catch (e) {
                console.debug(`Claude directory not found: ${this.claudePath}`);
                return false;
            }

            try {
                await projectsDir.query_info_async(
                    'standard::type',
                    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                    GLib.PRIORITY_DEFAULT,
                    null
                );
                return true;
            } catch (e) {
                console.debug(
                    `Projects directory not found: ${this.projectsPath}`
                );
                return false;
            }
        } catch (e) {
            console.error('Error checking Claude directory:', e);
            return false;
        }
    }

    /**
     * Gets the pricing information for a given model name.
     * @param {string} modelName - The name of the model.
     * @returns {{input: number, output: number, cacheWrite: number, cacheRead: number}}
     * @private
     */
    _getModelPrices(modelName) {
        if (!modelName) {
            return { input: 0.0, output: 0.0, cacheWrite: 0.0, cacheRead: 0.0 };
        }

        // 标准化模型名称（转小写，替换下划线为连字符）
        const normalizedModel = modelName.toLowerCase().replace(/_/g, '-');

        // 直接匹配
        if (this.modelPrices[normalizedModel]) {
            return this.modelPrices[normalizedModel];
        }

        // 模糊匹配：查找包含关键词的模型
        for (const [key, prices] of Object.entries(this.modelPrices)) {
            if (
                normalizedModel.includes(key) ||
                key.includes(normalizedModel)
            ) {
                return prices;
            }
        }

        // 按系列匹配
        if (normalizedModel.includes('opus')) {
            return (
                this.modelPrices['claude-3-opus'] || {
                    input: 15.0,
                    output: 75.0,
                    cacheWrite: 18.75,
                    cacheRead: 1.5,
                }
            );
        } else if (normalizedModel.includes('sonnet')) {
            return (
                this.modelPrices['claude-3.5-sonnet'] || {
                    input: 3.0,
                    output: 15.0,
                    cacheWrite: 3.75,
                    cacheRead: 0.3,
                }
            );
        } else if (normalizedModel.includes('haiku')) {
            return (
                this.modelPrices['claude-3.5-haiku'] || {
                    input: 0.8,
                    output: 4.0,
                    cacheWrite: 1.0,
                    cacheRead: 0.08,
                }
            );
        }

        // 如果没有找到匹配的模型，静默返回零成本，避免日志刷屏
        return { input: 0.0, output: 0.0, cacheWrite: 0.0, cacheRead: 0.0 };
    }

    /**
     * Calculates the cost for a single log entry.
     * @private
     */
    _calculateCost(
        model,
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens
    ) {
        const prices = this._getModelPrices(model);

        const cost =
            (inputTokens * prices.input) / 1_000_000 +
            (outputTokens * prices.output) / 1_000_000 +
            (cacheCreationTokens * prices.cacheWrite) / 1_000_000 +
            (cacheReadTokens * prices.cacheRead) / 1_000_000;

        return cost;
    }

    /**
     * 读取并解码文件内容
     */
    async _readAndDecodeFile(filePath) {
        try {
            const file = Gio.File.new_for_path(filePath);
            const [contents] = await file.load_contents_async(null);

            if (!contents || contents.length === 0) {
                console.debug(`File is empty or does not exist: ${filePath}`);
                return null;
            }

            const decoder = new TextDecoder('utf-8');
            return decoder.decode(contents);
        } catch (e) {
            if (
                e.matches &&
                e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)
            ) {
                console.debug(`File not found: ${filePath}`);
            } else {
                console.error(`Failed to read or decode file: ${filePath}`, e);
            }
            return null;
        }
    }

    /**
     * 解析 JSONL 文件 (异步版本)
     */
    async _parseJsonlFile(filePath) {
        const entries = [];

        try {
            const content = await this._readAndDecodeFile(filePath);
            if (!content) {
                return entries;
            }

            const lines = content.split('\n');
            const processedIds = new Set(); // 用于去重

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;

                try {
                    const jsonData = JSON.parse(trimmedLine);

                    // 检查JSON数据的有效性
                    if (!jsonData || typeof jsonData !== 'object') {
                        continue;
                    }

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
                        const cacheCreationTokens =
                            usage.cache_creation_input_tokens || 0;
                        const cacheReadTokens =
                            usage.cache_read_input_tokens || 0;

                        // 跳过没有实际 token 使用的条目，但允许只有输出tokens的情况
                        if (
                            inputTokens === 0 &&
                            outputTokens === 0 &&
                            cacheCreationTokens === 0 &&
                            cacheReadTokens === 0
                        ) {
                            continue;
                        }

                        // 确保 token 数量为非负数
                        const validInputTokens = Math.max(0, inputTokens);
                        const validOutputTokens = Math.max(0, outputTokens);
                        const validCacheCreationTokens = Math.max(
                            0,
                            cacheCreationTokens
                        );
                        const validCacheReadTokens = Math.max(
                            0,
                            cacheReadTokens
                        );

                        const model = jsonData.message.model || 'unknown';
                        const timestamp = jsonData.timestamp;
                        const sessionId = jsonData.sessionId || 'unknown';

                        // 推断项目路径（从文件路径中提取）
                        let projectPath = 'Unknown Project';
                        try {
                            // filePath 格式: ~/.claude/projects/{encoded_project_path}/{session_id}.jsonl
                            const pathParts = filePath.split('/');
                            const projectsIndex = pathParts.findIndex(
                                (part) => part === 'projects'
                            );
                            if (
                                projectsIndex >= 0 &&
                                projectsIndex < pathParts.length - 2
                            ) {
                                const encodedPath =
                                    pathParts[projectsIndex + 1];
                                // 尝试解码项目路径
                                try {
                                    projectPath = decodeURIComponent(
                                        encodedPath.replace(/%2F/g, '/')
                                    );
                                } catch (e) {
                                    projectPath = encodedPath; // 如果解码失败，使用原始值
                                }
                            }
                        } catch (e) {
                            console.debug(
                                'Failed to extract project path from:',
                                filePath,
                                e
                            );
                        }

                        const cost = this._calculateCost(
                            model,
                            validInputTokens,
                            validOutputTokens,
                            validCacheCreationTokens,
                            validCacheReadTokens
                        );

                        entries.push({
                            timestamp,
                            model,
                            inputTokens: validInputTokens,
                            outputTokens: validOutputTokens,
                            cacheCreationTokens: validCacheCreationTokens,
                            cacheReadTokens: validCacheReadTokens,
                            cost,
                            sessionId,
                            projectPath,
                        });
                    }
                } catch (parseError) {
                    // 忽略解析错误的行，但记录调试信息
                    console.debug(
                        `Failed to parse JSONL line in ${filePath}:`,
                        parseError.message,
                        `Line content: ${trimmedLine.substring(0, 100)}...`
                    );
                }
            }
        } catch (error) {
            console.error(
                `Failed to parse JSONL file content from: ${filePath}`,
                error
            );
        }

        return entries;
    }

    /**
     * Scans all project directories and collects all log entries.
     * @returns {Promise<Array<object>>} - An array of all parsed log entries.
     * @private
     */
    async _collectAllEntries() {
        const allEntries = [];

        try {
            const projectsDir = Gio.File.new_for_path(this.projectsPath);

            // 使用promisified方法检查目录是否存在
            try {
                await projectsDir.query_info_async(
                    'standard::type',
                    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                    GLib.PRIORITY_DEFAULT,
                    null
                );
            } catch (e) {
                console.debug(
                    `Projects directory not found: ${this.projectsPath}`
                );
                return allEntries;
            }

            // 使用promisified方法枚举目录内容
            const enumerator = await projectsDir.enumerate_children_async(
                'standard::name,standard::type',
                Gio.FileQueryInfoFlags.NONE,
                GLib.PRIORITY_DEFAULT,
                null
            );

            // 使用异步迭代器批量获取文件信息
            while (true) {
                const fileInfos = await enumerator.next_files_async(
                    10,
                    GLib.PRIORITY_DEFAULT,
                    null
                );

                if (fileInfos.length === 0) {
                    break;
                }

                for (const info of fileInfos) {
                    if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                        const projectName = info.get_name();
                        const projectPath = GLib.build_filenamev([
                            this.projectsPath,
                            projectName,
                        ]);

                        // 递归查找 .jsonl 文件
                        await this._scanDirectory(projectPath, allEntries);
                    }
                }
            }
        } catch (e) {
            console.error('Failed to scan projects directory:', e);
        }

        return allEntries;
    }

    /**
     * Recursively scans a directory for .jsonl files and parses them.
     * @param {string} dirPath - The directory path to scan.
     * @param {Array<object>} entries - The array to accumulate results in.
     * @private
     */
    async _scanDirectory(dirPath, entries) {
        try {
            const dir = Gio.File.new_for_path(dirPath);

            // 使用promisified方法检查目录是否存在
            try {
                await dir.query_info_async(
                    'standard::type',
                    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                    GLib.PRIORITY_DEFAULT,
                    null
                );
            } catch (e) {
                console.debug(`Directory not found: ${dirPath}`);
                return;
            }

            // 使用promisified方法枚举目录内容
            const enumerator = await dir.enumerate_children_async(
                'standard::name,standard::type',
                Gio.FileQueryInfoFlags.NONE,
                GLib.PRIORITY_DEFAULT,
                null
            );

            // 使用异步迭代器批量获取文件信息
            while (true) {
                const fileInfos = await enumerator.next_files_async(
                    10,
                    GLib.PRIORITY_DEFAULT,
                    null
                );

                if (fileInfos.length === 0) {
                    break;
                }

                for (const info of fileInfos) {
                    const fileName = info.get_name();
                    const filePath = GLib.build_filenamev([dirPath, fileName]);

                    if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                        // 递归扫描子目录
                        await this._scanDirectory(filePath, entries);
                    } else if (fileName.endsWith('.jsonl')) {
                        // 解析 JSONL 文件
                        const fileEntries =
                            await this._parseJsonlFile(filePath);
                        entries.push(...fileEntries);
                    }
                }
            }
        } catch (e) {
            console.debug('Failed to scan directory:', dirPath, e);
        }
    }

    /**
     * Calculates and returns aggregated token statistics.
     * @returns {Promise<TokenStats>}
     */
    async getTokenStats() {
        const stats = new TokenStats();

        const directoryExists = await this._claudeDirectoryExists();
        if (!directoryExists) {
            console.debug('Claude directory not found, returning empty stats');
            return stats;
        }

        try {
            const allEntries = await this._collectAllEntries();

            if (allEntries.length === 0) {
                console.debug('No usage entries found');
                return stats;
            }

            // 统计唯一会话数
            const uniqueSessions = new Set();
            const modelStats = new Map();
            const dateStats = new Map();
            const projectStats = new Map();

            // 累计统计
            for (const entry of allEntries) {
                stats.totalCost += entry.cost;
                stats.totalInputTokens += entry.inputTokens;
                stats.totalOutputTokens += entry.outputTokens;
                stats.totalCacheCreationTokens += entry.cacheCreationTokens;
                stats.totalCacheReadTokens += entry.cacheReadTokens;

                uniqueSessions.add(entry.sessionId);

                // 按模型统计
                if (!modelStats.has(entry.model)) {
                    modelStats.set(entry.model, {
                        model: entry.model,
                        totalCost: 0,
                        totalTokens: 0,
                        inputTokens: 0,
                        outputTokens: 0,
                        cacheCreationTokens: 0,
                        cacheReadTokens: 0,
                        sessionCount: new Set(),
                    });
                }
                const modelStat = modelStats.get(entry.model);
                modelStat.totalCost += entry.cost;
                modelStat.inputTokens += entry.inputTokens;
                modelStat.outputTokens += entry.outputTokens;
                modelStat.cacheCreationTokens += entry.cacheCreationTokens;
                modelStat.cacheReadTokens += entry.cacheReadTokens;
                modelStat.sessionCount.add(entry.sessionId);

                // 按日期统计
                const date = entry.timestamp
                    ? new Date(entry.timestamp).toISOString().split('T')[0]
                    : 'unknown';
                if (!dateStats.has(date)) {
                    dateStats.set(date, {
                        date: date,
                        totalCost: 0,
                        totalTokens: 0,
                        modelsUsed: new Set(),
                    });
                }
                const dateStat = dateStats.get(date);
                dateStat.totalCost += entry.cost;
                dateStat.totalTokens +=
                    entry.inputTokens +
                    entry.outputTokens +
                    entry.cacheCreationTokens +
                    entry.cacheReadTokens;
                dateStat.modelsUsed.add(entry.model);

                // 按项目统计（从会诞id推断项目）
                const projectPath = entry.projectPath || 'Unknown Project';
                if (!projectStats.has(projectPath)) {
                    projectStats.set(projectPath, {
                        projectPath: projectPath,
                        totalCost: 0,
                        totalTokens: 0,
                        sessionCount: new Set(),
                    });
                }
                const projectStat = projectStats.get(projectPath);
                projectStat.totalCost += entry.cost;
                projectStat.totalTokens +=
                    entry.inputTokens +
                    entry.outputTokens +
                    entry.cacheCreationTokens +
                    entry.cacheReadTokens;
                projectStat.sessionCount.add(entry.sessionId);
            }

            stats.totalTokens =
                stats.totalInputTokens +
                stats.totalOutputTokens +
                stats.totalCacheCreationTokens +
                stats.totalCacheReadTokens;
            stats.totalSessions = uniqueSessions.size;
            stats.lastUpdated = new Date().toISOString();

            // 转换为数组并排序
            stats.byModel = Array.from(modelStats.values())
                .map((stat) => ({
                    ...stat,
                    totalTokens:
                        stat.inputTokens +
                        stat.outputTokens +
                        stat.cacheCreationTokens +
                        stat.cacheReadTokens,
                    sessionCount: stat.sessionCount.size,
                }))
                .sort((a, b) => b.totalCost - a.totalCost);

            stats.byDate = Array.from(dateStats.values())
                .map((stat) => ({
                    ...stat,
                    modelsUsed: Array.from(stat.modelsUsed),
                }))
                .sort((a, b) => new Date(a.date) - new Date(b.date));

            stats.byProject = Array.from(projectStats.values())
                .map((stat) => ({
                    ...stat,
                    sessionCount: stat.sessionCount.size,
                }))
                .sort((a, b) => b.totalCost - a.totalCost);

            console.log(
                `Token stats: ${stats.totalTokens} tokens, ${stats.totalSessions} sessions, $${stats.totalCost.toFixed(4)} cost`
            );
        } catch (e) {
            console.error('Failed to calculate token stats:', e);
        }

        return stats;
    }

    /**
     * Gets a detailed list of all sessions and their aggregated stats.
     * @returns {Promise<Array<object>>}
     */
    async getSessionsDetail() {
        const sessionsDetail = [];

        if (!(await this._claudeDirectoryExists())) {
            return sessionsDetail;
        }

        try {
            const allEntries = await this._collectAllEntries();

            if (allEntries.length === 0) {
                return sessionsDetail;
            }

            // 按会话ID分组
            const sessionGroups = new Map();

            for (const entry of allEntries) {
                const sessionId = entry.sessionId;

                if (!sessionGroups.has(sessionId)) {
                    sessionGroups.set(sessionId, {
                        sessionId,
                        totalCost: 0,
                        totalTokens: 0,
                        totalInputTokens: 0,
                        totalOutputTokens: 0,
                        totalCacheCreationTokens: 0,
                        totalCacheReadTokens: 0,
                        messageCount: 0,
                        firstTimestamp: entry.timestamp,
                        lastTimestamp: entry.timestamp,
                        models: new Set(),
                        entries: [],
                    });
                }

                const session = sessionGroups.get(sessionId);
                session.totalCost += entry.cost;
                session.totalInputTokens += entry.inputTokens;
                session.totalOutputTokens += entry.outputTokens;
                session.totalCacheCreationTokens += entry.cacheCreationTokens;
                session.totalCacheReadTokens += entry.cacheReadTokens;
                session.messageCount++;
                session.models.add(entry.model);
                session.entries.push(entry);

                // 更新时间范围
                if (entry.timestamp < session.firstTimestamp) {
                    session.firstTimestamp = entry.timestamp;
                }
                if (entry.timestamp > session.lastTimestamp) {
                    session.lastTimestamp = entry.timestamp;
                }
            }

            // 转换为数组并计算总token数
            for (const session of sessionGroups.values()) {
                session.totalTokens =
                    session.totalInputTokens +
                    session.totalOutputTokens +
                    session.totalCacheCreationTokens +
                    session.totalCacheReadTokens;
                session.models = Array.from(session.models);
                sessionsDetail.push(session);
            }

            // 按最后活动时间倒序排列
            sessionsDetail.sort(
                (a, b) => new Date(b.lastTimestamp) - new Date(a.lastTimestamp)
            );
        } catch (e) {
            console.error('Failed to get sessions detail:', e);
        }

        return sessionsDetail;
    }

    /**
     * Gets all messages for a specific session.
     * @param {string} sessionId - The ID of the session.
     * @returns {Promise<Array<object>>}
     */
    async getSessionMessages(sessionId) {
        const messages = [];

        if (!(await this._claudeDirectoryExists())) {
            return messages;
        }

        try {
            const allEntries = await this._collectAllEntries();

            // 筛选出属于指定会话的条目
            const sessionEntries = allEntries.filter(
                (entry) => entry.sessionId === sessionId
            );

            if (sessionEntries.length === 0) {
                return messages;
            }

            // 重新读取JSONL文件以获取完整的消息内容
            const messagesMap = new Map();

            // 扫描所有项目目录的JSONL文件 (异步调用)
            await this._collectSessionMessages(sessionId, messagesMap);

            // 转换为数组并按时间排序
            for (const message of messagesMap.values()) {
                messages.push(message);
            }

            // 按时间戳排序，确保用户消息和助手消息按正确顺序显示
            messages.sort((a, b) => {
                const timeA = new Date(a.timestamp).getTime();
                const timeB = new Date(b.timestamp).getTime();

                // 如果时间戳相同，用户消息排在前面
                if (timeA === timeB) {
                    if (a.role === 'user' && b.role === 'assistant') return -1;
                    if (a.role === 'assistant' && b.role === 'user') return 1;
                    return 0;
                }

                return timeA - timeB;
            });

            // 分组相同时间戳和角色的消息为版本
            const groupedMessages = this._groupMessageVersions(messages);
            return groupedMessages;
        } catch (e) {
            console.error('Failed to get session messages:', e);
        }

        return messages;
    }

    /**
     * 将相同时间戳和角色的消息分组为版本
     */
    _groupMessageVersions(messages) {
        const grouped = [];
        const messageGroups = new Map();

        // 按时间戳和角色分组
        for (const message of messages) {
            // 创建分组键：时间戳（精确到秒）+ 角色
            const timestamp = new Date(message.timestamp);
            const timestampKey = Math.floor(timestamp.getTime() / 1000); // 精确到秒
            const groupKey = `${timestampKey}_${message.role}`;

            if (!messageGroups.has(groupKey)) {
                messageGroups.set(groupKey, []);
            }
            messageGroups.get(groupKey).push(message);
        }

        // 为每个分组创建版本化的消息对象
        for (const [groupKey, versions] of messageGroups.entries()) {
            if (versions.length === 1) {
                // 只有一个版本的消息，直接添加
                grouped.push(versions[0]);
            } else {
                // 有多个版本的消息，按内容长度去重（相同内容只保留一个）
                const uniqueVersions = [];
                const contentHashes = new Set();

                for (const version of versions) {
                    const contentStr = JSON.stringify(version.content || []);
                    const contentHash = this._simpleHash(contentStr);

                    if (!contentHashes.has(contentHash)) {
                        contentHashes.add(contentHash);
                        uniqueVersions.push(version);
                    }
                }

                // 如果去重后只有一个版本，直接添加
                if (uniqueVersions.length === 1) {
                    grouped.push(uniqueVersions[0]);
                } else {
                    // 按时间排序版本
                    uniqueVersions.sort(
                        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
                    );

                    const versionedMessage = {
                        ...uniqueVersions[0], // 使用第一个版本作为基础
                        isVersioned: true,
                        versions: uniqueVersions,
                        currentVersion: 0,
                        totalVersions: uniqueVersions.length,
                        id: `versioned_${groupKey}`, // 使用唯一的版本化ID
                    };

                    grouped.push(versionedMessage);
                }
            }
        }

        // 重新按时间排序
        grouped.sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();

            if (timeA === timeB) {
                if (a.role === 'user' && b.role === 'assistant') return -1;
                if (a.role === 'assistant' && b.role === 'user') return 1;
                return 0;
            }

            return timeA - timeB;
        });

        return grouped;
    }

    /**
     * 简单的字符串哈希函数
     */
    _simpleHash(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // 转换为32位整数
        }
        return hash;
    }

    /**
     * 收集特定会话的消息内容 (异步版本)
     */
    async _collectSessionMessages(sessionId, messagesMap) {
        try {
            const projectsDir = Gio.File.new_for_path(this.projectsPath);

            // 使用promisified方法检查projects目录是否存在
            try {
                await projectsDir.query_info_async(
                    'standard::type',
                    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                    GLib.PRIORITY_DEFAULT,
                    null
                );
            } catch (e) {
                console.debug(
                    `Projects directory not found: ${this.projectsPath}`
                );
                return;
            }

            // 使用promisified方法枚举目录内容
            const enumerator = await projectsDir.enumerate_children_async(
                'standard::name,standard::type',
                Gio.FileQueryInfoFlags.NONE,
                GLib.PRIORITY_DEFAULT,
                null
            );

            // 使用异步迭代器批量获取文件信息
            while (true) {
                const fileInfos = await enumerator.next_files_async(
                    10,
                    GLib.PRIORITY_DEFAULT,
                    null
                );

                if (fileInfos.length === 0) {
                    break;
                }

                for (const info of fileInfos) {
                    if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                        const projectName = info.get_name();
                        const projectPath = GLib.build_filenamev([
                            this.projectsPath,
                            projectName,
                        ]);

                        // 递归查找 .jsonl 文件 (异步调用)
                        await this._scanDirectoryForSessionMessages(
                            projectPath,
                            sessionId,
                            messagesMap
                        );
                    }
                }
            }
        } catch (e) {
            console.error('Failed to collect session messages:', e);
        }
    }

    /**
     * 递归扫描目录查找特定会话的消息 (异步版本)
     */
    async _scanDirectoryForSessionMessages(dirPath, sessionId, messagesMap) {
        try {
            const dir = Gio.File.new_for_path(dirPath);

            // 使用promisified方法检查目录是否存在
            try {
                await dir.query_info_async(
                    'standard::type',
                    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                    GLib.PRIORITY_DEFAULT,
                    null
                );
            } catch (e) {
                console.debug(`Directory not found: ${dirPath}`);
                return;
            }

            // 使用promisified方法枚举目录内容
            const enumerator = await dir.enumerate_children_async(
                'standard::name,standard::type',
                Gio.FileQueryInfoFlags.NONE,
                GLib.PRIORITY_DEFAULT,
                null
            );

            // 使用异步迭代器批量获取文件信息
            while (true) {
                const fileInfos = await enumerator.next_files_async(
                    10,
                    GLib.PRIORITY_DEFAULT,
                    null
                );

                if (fileInfos.length === 0) {
                    break;
                }

                for (const info of fileInfos) {
                    const fileName = info.get_name();
                    const filePath = GLib.build_filenamev([dirPath, fileName]);

                    if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                        // 递归扫描子目录 (异步调用)
                        await this._scanDirectoryForSessionMessages(
                            filePath,
                            sessionId,
                            messagesMap
                        );
                    } else if (fileName.endsWith('.jsonl')) {
                        // 解析 JSONL 文件中的消息 (异步调用)
                        await this._parseSessionMessagesFromJsonl(
                            filePath,
                            sessionId,
                            messagesMap
                        );
                    }
                }
            }
        } catch (e) {
            console.debug(
                'Failed to scan directory for session messages:',
                dirPath,
                e
            );
        }
    }

    /**
     * 从JSONL文件中解析特定会话的消息 (异步版本)
     */
    async _parseSessionMessagesFromJsonl(filePath, sessionId, messagesMap) {
        try {
            const file = Gio.File.new_for_path(filePath);

            // 使用promisified方法检查文件是否存在
            try {
                await file.query_info_async(
                    'standard::type',
                    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                    GLib.PRIORITY_DEFAULT,
                    null
                );
            } catch (e) {
                console.debug(`Session messages file not found: ${filePath}`);
                return;
            }

            // 使用promisified方法异步读取文件内容
            let contents;
            try {
                [contents] = await file.load_contents_async(null);
            } catch (e) {
                console.error(
                    `Failed to read session messages file: ${filePath}`,
                    e
                );
                return;
            }

            if (!contents) {
                console.debug(
                    `Session messages file is empty or unreadable: ${filePath}`
                );
                return;
            }

            // 检查是否为空数据
            if (contents.length !== undefined && contents.length === 0) {
                console.debug(
                    `Session messages file content is empty: ${filePath}`
                );
                return;
            }

            // 调试信息：记录文件内容类型
            console.debug(
                `Processing session messages file: ${filePath}, content type: ${typeof contents}, constructor: ${contents?.constructor?.name}, length: ${contents?.length}`
            );

            let content;
            try {
                // 如果contents已经是字符串，直接使用
                if (typeof contents === 'string') {
                    content = contents;
                } else if (
                    contents instanceof Uint8Array ||
                    contents instanceof ArrayBuffer
                ) {
                    // 验证是有效的二进制数据后再解码
                    const decoder = new TextDecoder('utf-8');
                    content = decoder.decode(contents);
                } else if (
                    contents &&
                    typeof contents === 'object' &&
                    'length' in contents
                ) {
                    // 尝试将其他类数组对象转换为Uint8Array
                    try {
                        const uint8Array = new Uint8Array(contents);
                        const decoder = new TextDecoder('utf-8');
                        content = decoder.decode(uint8Array);
                    } catch (conversionError) {
                        console.error(
                            `Failed to convert session messages file content to Uint8Array: ${filePath}`,
                            conversionError
                        );
                        console.error(
                            `Contents details: type=${typeof contents}, length=${contents?.length}, constructor=${contents?.constructor?.name}`
                        );
                        return;
                    }
                } else {
                    // 无法处理的数据类型
                    console.error(
                        `Unsupported session messages file content type for: ${filePath}`,
                        typeof contents,
                        contents?.constructor?.name
                    );
                    console.error(
                        `Contents details: ${JSON.stringify(contents).substring(0, 100)}...`
                    );
                    return;
                }
            } catch (decodeError) {
                console.error(
                    `Failed to decode session messages file: ${filePath}`,
                    decodeError
                );
                console.error(
                    `Contents details: type=${typeof contents}, length=${contents?.length}, constructor=${contents?.constructor?.name}`
                );
                return;
            }

            // 检查内容是否为空
            if (!content || content.trim().length === 0) {
                console.debug(
                    `Session messages file content is empty: ${filePath}`
                );
                return;
            }

            const lines = content.split('\n');

            for (const line of lines) {
                if (!line.trim()) continue;

                try {
                    const jsonData = JSON.parse(line);

                    // 检查是否属于指定会话
                    if (jsonData.sessionId === sessionId) {
                        // 根据 type 字段和内容来处理不同类型的消息
                        if (jsonData.message && jsonData.type) {
                            // 为没有ID的消息生成唯一ID
                            let messageId;
                            if (jsonData.message.id) {
                                messageId = jsonData.message.id;
                            } else {
                                // 为用户消息和其他没有ID的消息生成唯一标识符
                                const contentHash = JSON.stringify(
                                    jsonData.message.content || []
                                ).substring(0, 20);
                                messageId = `${jsonData.type}_${jsonData.timestamp}_${contentHash}`;
                            }

                            // 避免重复添加相同的消息
                            if (!messagesMap.has(messageId)) {
                                // 确定消息的实际角色
                                let actualRole =
                                    jsonData.message.role || jsonData.type;

                                // 特殊处理：如果是用户类型但包含工具结果，标记为工具结果
                                if (
                                    jsonData.type === 'user' &&
                                    jsonData.message.content
                                ) {
                                    const hasToolResult =
                                        Array.isArray(
                                            jsonData.message.content
                                        ) &&
                                        jsonData.message.content.some(
                                            (item) =>
                                                item.type === 'tool_result'
                                        );
                                    if (hasToolResult) {
                                        actualRole = 'tool_result';
                                    }
                                }

                                const message = {
                                    id: messageId,
                                    timestamp: jsonData.timestamp,
                                    sessionId: jsonData.sessionId,
                                    role: actualRole,
                                    content: jsonData.message.content || [],
                                    model: jsonData.message.model || null,
                                    usage: jsonData.message.usage || {},
                                    rawData: jsonData,
                                    type: jsonData.type,
                                    originalRole:
                                        jsonData.message.role || jsonData.type, // 保留原始角色信息
                                };

                                messagesMap.set(messageId, message);
                                console.debug(
                                    `Added message: ${messageId}, role: ${actualRole}, type: ${jsonData.type}, content length: ${JSON.stringify(message.content).length}`
                                );
                            } else {
                                console.debug(
                                    `Duplicate message skipped: ${messageId}`
                                );
                            }
                        }

                        // 处理系统消息或其他类型（兼容旧格式）
                        if (jsonData.systemMessage) {
                            const systemMessageId = `system_${jsonData.timestamp}_0`;

                            if (!messagesMap.has(systemMessageId)) {
                                const message = {
                                    id: systemMessageId,
                                    timestamp: jsonData.timestamp,
                                    sessionId: jsonData.sessionId,
                                    role: 'system',
                                    content:
                                        jsonData.systemMessage.content || [],
                                    model: null,
                                    usage: {},
                                    rawData: jsonData,
                                    type: 'system',
                                    originalRole: 'system',
                                };

                                messagesMap.set(systemMessageId, message);
                            }
                        }
                    }
                } catch (e) {
                    // 忽略解析错误的行
                    console.debug('Failed to parse JSONL line:', e);
                }
            }
        } catch (e) {
            console.error(
                'Failed to read JSONL file for session messages:',
                filePath,
                e
            );
        }
    }

    /**
     * 异步获取特定会话的消息内容
     */
    async getSessionMessagesAsync(sessionId) {
        return await this.getSessionMessages(sessionId);
    }

    /**
     * 异步获取会话详细信息
     */
    async getSessionsDetailAsync() {
        return await this.getSessionsDetail();
    }

    /**
     * 异步获取 token 统计信息
     */
    async getTokenStatsAsync() {
        return await this.getTokenStats();
    }
}
