#!/user/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { MongoClient, Db, Collection, ObjectId } from "mongodb"

const MONGODB_URI = "mongodb://localhost:27017"
const MONGODB_DATABASE_NAME = "next_app_final"
const MONGODB_COLLECTION_NAME = "blogmodels"

interface BlogModel {
    _id: ObjectId;
    title: string;
    description: string;
    image: string;
    tags: string[];
    author: {
        name: string;
        image: string;
    }
}

class BlogMcpServer {
    private server: McpServer
    private mongoClient: MongoClient
    private db: Db | null = null
    private collection: Collection<BlogModel> | null = null

    constructor() {
        // 创建MCP服务器实例
        this.server = new McpServer({
            name: 'blog-mcp-server',
            version: '1.0.0'
        })

        // 初始化MongoDB
        this.mongoClient = new MongoClient(MONGODB_URI)

        // 注册工具函数
        this.setupTools()

        // 建立资源集
        this.setupResource()
    }

    // 连接到mongoDB
    private async connectToMongoDB(): Promise<void> {
        try {
            await this.mongoClient.connect()
            this.db = this.mongoClient.db(MONGODB_DATABASE_NAME)
            this.collection = this.db.collection<BlogModel>(MONGODB_COLLECTION_NAME)
            console.log("✅ 连接到MongoDB成功")
        } catch (error) {
            console.error("❌ 连接MongoDB失败");
            throw error
        }
    }

    // 启动服务
    async start(): Promise<void> {
        try {
            // 连接到 MongoDB
            await this.connectToMongoDB();

            // 设置进程退出处理
            process.on('SIGINT', async () => {
                console.error('\n🔄 正在关闭服务器...');
                await this.cleanup();
                process.exit(0);
            });

            // 启动 MCP 服务器
            const transport = new StdioServerTransport();
            await this.server.connect(transport);

            console.error("🚀 Blog MCP Server 已启动");
        } catch (error) {
            console.error("❌ 服务器启动失败:", error);
            await this.cleanup();
            process.exit(1);
        }
    }

    // 清理资源
    private async cleanup(): Promise<void> {
        try {
            if (this.mongoClient) {
                await this.mongoClient.close();
                console.error("✅ MongoDB 连接已关闭");
            }
        } catch (error) {
            console.error("❌ 清理资源时出错:", error);
        }
    }

    // 工具函数
    private setupTools(): void {
        this.server.registerTool(
            'list-blog',
            {
                title: '查询列表内容',
                description: '获取所有的博客列表内容，支持筛选作者',
                inputSchema: {
                    author: z.string().optional().describe('作者姓名筛选'),
                    limit: z.number().default(20).describe('筛选多少条数据')
                }
            },
            async ({ author, limit }) => {
                if (!this.collection) {
                    throw new Error('数据库未建立')
                }
                const query: Record<string, any> = {}
                if (author) {
                    query['author.name'] = { $regex: author, $options: 'i' }
                }
                const result = await this.collection.find(query).limit(limit).toArray()
                return {
                    content: [{
                        type: 'text',
                        text: `找到了 ${result.length} 条数据: \n${JSON.stringify(result, null, 2)}`
                    }]
                }
            }
        )
    }

    // 建立资源
    private setupResource(): void {
        // 提供博客列表数据作为资源
        this.server.registerResource(
            'blogs',
            'bloglist://blogs',
            {
                title: '博客列表',
                description: '当前所有的博客文章列表',
                mimeType: 'application/json'
            },
            async () => {
                if (!this.collection) {
                    throw new Error('数据库未连接')
                }
                const blogs = await this.collection.find().toArray()

                return {
                    contents: [{
                        uri: 'bloglist://blogs',
                        mimeType: 'application/json',
                        text: JSON.stringify(blogs, null, 2)
                    }]
                }
            }
        )
    }
}

// 启动服务
const server = new BlogMcpServer()
server.start().catch(console.error);
