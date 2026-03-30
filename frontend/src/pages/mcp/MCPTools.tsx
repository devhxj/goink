import { useState, useEffect } from 'react'
import { Card, Tabs, Table, Button, Tag, Collapse, Input, message, Spin, Descriptions, List, Divider, Row, Col, Statistic, Alert } from 'antd'
import { PlayCircleOutlined, SearchOutlined, FileTextOutlined, TeamOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import { mcpApi } from '@/services/mcpService'
import { getErrorMessage } from '@/types/error'
import type { MCPToolInfo } from '@/types/mcp'

const { Panel } = Collapse
const { Search } = Input
const { TabPane } = Tabs

interface ExecuteResult {
  type: string
  data: Record<string, unknown>
}

function MCPTools() {
  const [loading, setLoading] = useState(false)
  const [tools, setTools] = useState<MCPToolInfo[]>([])
  const [categories, setCategories] = useState<Record<string, MCPToolInfo[]>>({})
  const [selectedTool, setSelectedTool] = useState<MCPToolInfo | null>(null)
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null)
  const { novelId } = useParams<{ novelId: string }>()
  const navigate = useNavigate()

  useEffect(() => {
    loadTools()
    loadCategories()
  }, [])

  const loadTools = async () => {
    setLoading(true)
    try {
      const response = await mcpApi.listTools()
      if (response.success) {
        setTools(response.data.tools)
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const loadCategories = async () => {
    try {
      const response = await mcpApi.listCategories()
      if (response.success) {
        setCategories(response.data)
      }
    } catch (error) {
      console.error('加载分类失败:', getErrorMessage(error))
    }
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'novel_management':
        return <FileTextOutlined />
      case 'memory_retrieval':
        return <SearchOutlined />
      case 'consistency_check':
        return <CheckCircleOutlined />
      case 'writing_assistant':
        return <TeamOutlined />
      default:
        return <PlayCircleOutlined />
    }
  }

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      novel_management: '小说管理',
      memory_retrieval: '记忆检索',
      consistency_check: '一致性检查',
      writing_assistant: '写作助手',
    }
    return labels[category] || category
  }

  const toolColumns = [
    { title: '工具名称', dataIndex: 'name', key: 'name' },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      render: (category: string) => <Tag>{getCategoryLabel(category)}</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: MCPToolInfo) => (
        <Button type="link" onClick={() => setSelectedTool(record)}>
          查看详情
        </Button>
      ),
    },
  ]

  const onSearchMemory = async (query: string) => {
    if (!novelId || !query) return
    setLoading(true)
    try {
      const response = await mcpApi.searchPlotMemory(parseInt(novelId), query)
      if (response.success) {
        setExecuteResult({ type: 'memory_search', data: response.data as unknown as Record<string, unknown> })
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const onGetNovelSummary = async () => {
    if (!novelId) return
    setLoading(true)
    try {
      const response = await mcpApi.getNovelSummary(parseInt(novelId))
      if (response.success) {
        setExecuteResult({ type: 'novel_summary', data: response.data as unknown as Record<string, unknown> })
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const onGetNovelProgress = async () => {
    if (!novelId) return
    setLoading(true)
    try {
      const response = await mcpApi.getNovelProgress(parseInt(novelId))
      if (response.success) {
        setExecuteResult({ type: 'novel_progress', data: response.data as unknown as Record<string, unknown> })
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const onCheckConsistency = async () => {
    if (!novelId) return
    setLoading(true)
    try {
      const response = await mcpApi.runFullConsistencyCheck(parseInt(novelId))
      if (response.success) {
        setExecuteResult({ type: 'consistency_check', data: response.data as unknown as Record<string, unknown> })
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const onGetForeshadowingStatus = async () => {
    if (!novelId) return
    setLoading(true)
    try {
      const response = await mcpApi.getForeshadowingStatus(parseInt(novelId))
      if (response.success) {
        setExecuteResult({ type: 'foreshadowing_status', data: response.data as unknown as Record<string, unknown> })
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const renderResult = () => {
    if (!executeResult) return null

    const { type, data } = executeResult

    switch (type) {
      case 'memory_search': {
        const searchData = data as { query: string; total: number; results: Array<{ type: string; relevance_score: number; content: string }> }
        return (
          <Card title="记忆搜索结果" size="small">
            <p>查询: {searchData.query}</p>
            <p>结果数: {searchData.total}</p>
            <List
              dataSource={searchData.results}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    title={`[${item.type}] 相关度: ${(item.relevance_score * 100).toFixed(1)}%`}
                    description={item.content.substring(0, 200) + '...'}
                  />
                </List.Item>
              )}
            />
          </Card>
        )
      }
      case 'novel_summary': {
        const summaryData = data as { title: string; genre: string; status: string; chapter_count: number; word_count: number; character_count: number; description: string }
        return (
          <Card title="小说摘要" size="small">
            <Descriptions column={2}>
              <Descriptions.Item label="标题">{summaryData.title}</Descriptions.Item>
              <Descriptions.Item label="类型">{summaryData.genre}</Descriptions.Item>
              <Descriptions.Item label="状态">{summaryData.status}</Descriptions.Item>
              <Descriptions.Item label="章节数">{summaryData.chapter_count}</Descriptions.Item>
              <Descriptions.Item label="字数">{summaryData.word_count}</Descriptions.Item>
              <Descriptions.Item label="角色数">{summaryData.character_count}</Descriptions.Item>
            </Descriptions>
            <Divider />
            <p>{summaryData.description}</p>
          </Card>
        )
      }
      case 'novel_progress': {
        const progressData = data as { total_chapters: number; completed_chapters: number; total_words: number; completion_percentage: number }
        return (
          <Card title="小说进度" size="small">
            <Row gutter={16}>
              <Col span={6}>
                <Statistic title="总章节" value={progressData.total_chapters} />
              </Col>
              <Col span={6}>
                <Statistic title="已完成" value={progressData.completed_chapters} />
              </Col>
              <Col span={6}>
                <Statistic title="总字数" value={progressData.total_words} />
              </Col>
              <Col span={6}>
                <Statistic title="完成率" value={progressData.completion_percentage} suffix="%" />
              </Col>
            </Row>
          </Card>
        )
      }
      case 'consistency_check': {
        const checkData = data as { passed: boolean; issues: Array<{ type: string; severity: string; description: string; suggestion: string }> }
        return (
          <Card title="一致性检查结果" size="small">
            <Alert
              title={checkData.passed ? '检查通过' : '发现问题'}
              type={checkData.passed ? 'success' : 'warning'}
              showIcon
              style={{ marginBottom: 16 }}
            />
            {checkData.issues.length > 0 && (
              <List
                dataSource={checkData.issues}
                renderItem={(issue) => (
                  <List.Item>
                    <List.Item.Meta
                      title={<Tag color={issue.severity === 'error' ? 'error' : 'warning'}>{issue.type}</Tag>}
                      description={issue.description}
                    />
                    <p>建议: {issue.suggestion}</p>
                  </List.Item>
                )}
              />
            )}
          </Card>
        )
      }
      case 'foreshadowing_status': {
        const foreshadowData = data as { total: number; resolved: number; pending: number; abandoned: number }
        return (
          <Card title="伏笔状态" size="small">
            <Row gutter={16}>
              <Col span={6}>
                <Statistic title="总数" value={foreshadowData.total} />
              </Col>
              <Col span={6}>
                <Statistic title="已解决" value={foreshadowData.resolved} />
              </Col>
              <Col span={6}>
                <Statistic title="待处理" value={foreshadowData.pending} />
              </Col>
              <Col span={6}>
                <Statistic title="已放弃" value={foreshadowData.abandoned} />
              </Col>
            </Row>
          </Card>
        )
      }
      default:
        return <Card title="结果"><pre>{JSON.stringify(data, null, 2)}</pre></Card>
    }
  }

  if (loading && tools.length === 0) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Spin size="large" />
        </div>
      </Card>
    )
  }

  return (
    <Card title="MCP工具集">
      <Tabs defaultActiveKey="quick">
        <TabPane tab="快捷工具" key="quick">
          <Row gutter={[16, 16]}>
            <Col span={8}>
              <Card hoverable onClick={onGetNovelSummary}>
                <Card.Meta
                  avatar={<FileTextOutlined style={{ fontSize: 24 }} />}
                  title="小说摘要"
                  description="获取小说整体摘要信息"
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card hoverable onClick={onGetNovelProgress}>
                <Card.Meta
                  avatar={<FileTextOutlined style={{ fontSize: 24 }} />}
                  title="小说进度"
                  description="查看小说写作进度"
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card hoverable onClick={onCheckConsistency}>
                <Card.Meta
                  avatar={<CheckCircleOutlined style={{ fontSize: 24 }} />}
                  title="一致性检查"
                  description="执行完整一致性检查"
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card hoverable onClick={onGetForeshadowingStatus}>
                <Card.Meta
                  avatar={<CheckCircleOutlined style={{ fontSize: 24 }} />}
                  title="伏笔状态"
                  description="查看伏笔统计信息"
                />
              </Card>
            </Col>
            <Col span={16}>
              <Card>
                <Card.Meta
                  avatar={<SearchOutlined style={{ fontSize: 24 }} />}
                  title="记忆搜索"
                  description="搜索小说情节记忆"
                />
                <Search
                  placeholder="输入搜索关键词..."
                  enterButton="搜索"
                  size="large"
                  onSearch={onSearchMemory}
                  style={{ marginTop: 16 }}
                />
              </Card>
            </Col>
          </Row>

          {executeResult && (
            <>
              <Divider>执行结果</Divider>
              {renderResult()}
            </>
          )}
        </TabPane>

        <TabPane tab="工具列表" key="list">
          <Table columns={toolColumns} dataSource={tools} rowKey="name" />
        </TabPane>

        <TabPane tab="按分类" key="categories">
          <Collapse accordion>
            {Object.entries(categories).map(([category, categoryTools]) => (
              <Panel
                header={
                  <span>
                    {getCategoryIcon(category)} {getCategoryLabel(category)} ({categoryTools.length})
                  </span>
                }
                key={category}
              >
                <List
                  dataSource={categoryTools}
                  renderItem={(tool) => (
                    <List.Item
                      actions={[<Button key="detail" type="link" onClick={() => setSelectedTool(tool)}>详情</Button>]}
                    >
                      <List.Item.Meta
                        title={tool.name}
                        description={tool.description}
                      />
                    </List.Item>
                  )}
                />
              </Panel>
            ))}
          </Collapse>
        </TabPane>
      </Tabs>

      {selectedTool && (
        <Card title={`工具详情: ${selectedTool.name}`} style={{ marginTop: 16 }}>
          <Descriptions column={1}>
            <Descriptions.Item label="名称">{selectedTool.name}</Descriptions.Item>
            <Descriptions.Item label="描述">{selectedTool.description}</Descriptions.Item>
            <Descriptions.Item label="分类">
              <Tag>{getCategoryLabel(selectedTool.category)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="返回值">{selectedTool.returns}</Descriptions.Item>
          </Descriptions>
          <Divider>参数</Divider>
          <Table
            dataSource={selectedTool.parameters}
            rowKey="name"
            pagination={false}
            size="small"
            columns={[
              { title: '参数名', dataIndex: 'name' },
              { title: '类型', dataIndex: 'type' },
              { title: '必填', dataIndex: 'required', render: (v: boolean) => v ? <Tag color="red">是</Tag> : <Tag>否</Tag> },
              { title: '描述', dataIndex: 'description' },
              { title: '默认值', dataIndex: 'default' },
            ]}
          />
          <Button style={{ marginTop: 16 }} onClick={() => setSelectedTool(null)}>
            关闭
          </Button>
        </Card>
      )}

      <div style={{ marginTop: 16 }}>
        <Button onClick={() => navigate(`/novels/${novelId}`)}>返回小说详情</Button>
      </div>
    </Card>
  )
}

export default MCPTools
