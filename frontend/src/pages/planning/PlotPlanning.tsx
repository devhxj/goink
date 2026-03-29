import { useState, useEffect } from 'react'
import { Card, Tabs, Form, Input, Button, Select, message, Spin, Table, Tag, Modal, Row, Col, Statistic, Divider, List, Empty } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckOutlined, BulbOutlined } from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import { planningApi } from '@/services/planningService'
import { getErrorMessage } from '@/types/error'
import type {
  PlotOutline,
  PlotOutlineCreate,
  PlotLine,
  PlotLineCreate,
  PlotNode,
  PlotNodeCreate,
  PlotProgress,
  PlotSuggestion,
} from '@/types/planning'

const { TextArea } = Input
const { Option } = Select
const { TabPane } = Tabs

function PlotPlanning() {
  const [loading, setLoading] = useState(false)
  const [outline, setOutline] = useState<PlotOutline | null>(null)
  const [plotLines, setPlotLines] = useState<PlotLine[]>([])
  const [plotNodes, setPlotNodes] = useState<PlotNode[]>([])
  const [progress, setProgress] = useState<PlotProgress | null>(null)
  const [suggestions, setSuggestions] = useState<PlotSuggestion[]>([])
  const [outlineModalVisible, setOutlineModalVisible] = useState(false)
  const [plotLineModalVisible, setPlotLineModalVisible] = useState(false)
  const [plotNodeModalVisible, setPlotNodeModalVisible] = useState(false)
  const [suggestionModalVisible, setSuggestionModalVisible] = useState(false)
  const [editingPlotLine, setEditingPlotLine] = useState<PlotLine | null>(null)
  const [editingPlotNode, setEditingPlotNode] = useState<PlotNode | null>(null)
  const [outlineForm] = Form.useForm<PlotOutlineCreate>()
  const [plotLineForm] = Form.useForm<PlotLineCreate>()
  const [plotNodeForm] = Form.useForm<PlotNodeCreate>()
  const [suggestionForm] = Form.useForm<{ context: string; chapter_number: number; plot_line_id?: number }>()
  const { novelId } = useParams<{ novelId: string }>()
  const navigate = useNavigate()

  useEffect(() => {
    if (novelId) {
      loadAllData()
    }
  }, [novelId])

  const loadAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        loadOutline(),
        loadPlotLines(),
        loadPlotNodes(),
        loadProgress(),
      ])
    } finally {
      setLoading(false)
    }
  }

  const loadOutline = async () => {
    if (!novelId) return
    try {
      const response = await planningApi.getOutline(parseInt(novelId))
      if (response.success && 'id' in response.data) {
        setOutline(response.data as PlotOutline)
      }
    } catch (error) {
      console.error('加载大纲失败:', getErrorMessage(error))
    }
  }

  const loadPlotLines = async () => {
    if (!novelId) return
    try {
      const response = await planningApi.listPlotLines(parseInt(novelId))
      if (response.success) {
        setPlotLines(response.data.items)
      }
    } catch (error) {
      console.error('加载情节线失败:', getErrorMessage(error))
    }
  }

  const loadPlotNodes = async () => {
    if (!novelId) return
    try {
      const response = await planningApi.listPlotNodes(parseInt(novelId))
      if (response.success) {
        setPlotNodes(response.data.items)
      }
    } catch (error) {
      console.error('加载情节节点失败:', getErrorMessage(error))
    }
  }

  const loadProgress = async () => {
    if (!novelId) return
    try {
      const response = await planningApi.getProgress(parseInt(novelId))
      if (response.success) {
        setProgress(response.data)
      }
    } catch (error) {
      console.error('加载进度失败:', getErrorMessage(error))
    }
  }

  const onSaveOutline = async (values: PlotOutlineCreate) => {
    if (!novelId) return
    try {
      const response = await planningApi.createOutline(parseInt(novelId), values)
      if (response.success) {
        message.success('大纲保存成功')
        setOutlineModalVisible(false)
        outlineForm.resetFields()
        loadOutline()
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    }
  }

  const onSavePlotLine = async (values: PlotLineCreate) => {
    if (!novelId) return
    try {
      if (editingPlotLine) {
        const response = await planningApi.updatePlotLine(editingPlotLine.id, values)
        if (response.success) {
          message.success('情节线更新成功')
        }
      } else {
        const response = await planningApi.createPlotLine(parseInt(novelId), values)
        if (response.success) {
          message.success('情节线创建成功')
        }
      }
      setPlotLineModalVisible(false)
      plotLineForm.resetFields()
      setEditingPlotLine(null)
      loadPlotLines()
      loadProgress()
    } catch (error) {
      message.error(getErrorMessage(error))
    }
  }

  const onDeletePlotLine = async (id: number) => {
    try {
      const response = await planningApi.deletePlotLine(id)
      if (response.success) {
        message.success('情节线已删除')
        loadPlotLines()
        loadProgress()
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    }
  }

  const onSavePlotNode = async (values: PlotNodeCreate) => {
    if (!novelId) return
    try {
      if (editingPlotNode) {
        const response = await planningApi.updatePlotNode(editingPlotNode.id, values)
        if (response.success) {
          message.success('情节节点更新成功')
        }
      } else {
        const response = await planningApi.createPlotNode(parseInt(novelId), values)
        if (response.success) {
          message.success('情节节点创建成功')
        }
      }
      setPlotNodeModalVisible(false)
      plotNodeForm.resetFields()
      setEditingPlotNode(null)
      loadPlotNodes()
      loadProgress()
    } catch (error) {
      message.error(getErrorMessage(error))
    }
  }

  const onCompletePlotNode = async (id: number) => {
    try {
      const response = await planningApi.completePlotNode(id)
      if (response.success) {
        message.success('情节节点已完成')
        loadPlotNodes()
        loadProgress()
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    }
  }

  const onDeletePlotNode = async (id: number) => {
    try {
      const response = await planningApi.deletePlotNode(id)
      if (response.success) {
        message.success('情节节点已删除')
        loadPlotNodes()
        loadProgress()
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    }
  }

  const onGenerateSuggestions = async (values: { context: string; chapter_number: number; plot_line_id?: number }) => {
    if (!novelId) return
    try {
      const response = await planningApi.generateSuggestions(parseInt(novelId), values)
      if (response.success) {
        setSuggestions(response.data.suggestions)
        message.success('建议生成成功')
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    }
  }

  const getLineTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      main: '主线',
      sub: '支线',
      character: '角色线',
      background: '背景线',
    }
    return labels[type] || type
  }

  const getLineTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      main: 'red',
      sub: 'blue',
      character: 'green',
      background: 'gray',
    }
    return colors[type] || 'default'
  }

  const getNodeStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      planned: 'default',
      in_progress: 'processing',
      completed: 'success',
      skipped: 'warning',
    }
    return colors[status] || 'default'
  }

  const plotLineColumns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '类型',
      dataIndex: 'line_type',
      key: 'line_type',
      render: (type: string) => <Tag color={getLineTypeColor(type)}>{getLineTypeLabel(type)}</Tag>,
    },
    { title: '起始章节', dataIndex: 'start_chapter', key: 'start_chapter' },
    { title: '结束章节', dataIndex: 'end_chapter', key: 'end_chapter' },
    { title: '重要程度', dataIndex: 'importance', key: 'importance' },
    { title: '状态', dataIndex: 'status', key: 'status' },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: PlotLine) => (
        <>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingPlotLine(record)
              plotLineForm.setFieldsValue({
                name: record.name,
                description: record.description ?? undefined,
                line_type: record.line_type,
                start_chapter: record.start_chapter ?? undefined,
                end_chapter: record.end_chapter ?? undefined,
                importance: record.importance,
                metadata: record.metadata ?? undefined,
              })
              setPlotLineModalVisible(true)
            }}
          >
            编辑
          </Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => onDeletePlotLine(record.id)}>
            删除
          </Button>
        </>
      ),
    },
  ]

  const plotNodeColumns = [
    { title: '标题', dataIndex: 'title', key: 'title' },
    { title: '章节', dataIndex: 'chapter_number', key: 'chapter_number' },
    { title: '顺序', dataIndex: 'sequence', key: 'sequence' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <Tag color={getNodeStatusColor(status)}>{status}</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: PlotNode) => (
        <>
          {record.status !== 'completed' && (
            <Button type="link" icon={<CheckOutlined />} onClick={() => onCompletePlotNode(record.id)}>
              完成
            </Button>
          )}
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingPlotNode(record)
              plotNodeForm.setFieldsValue({
                plot_line_id: record.plot_line_id,
                title: record.title,
                description: record.description ?? undefined,
                chapter_number: record.chapter_number ?? undefined,
                sequence: record.sequence,
                characters_involved: record.characters_involved ?? undefined,
                prerequisites: record.prerequisites ?? undefined,
                consequences: record.consequences ?? undefined,
                notes: record.notes ?? undefined,
                metadata: record.metadata ?? undefined,
              })
              setPlotNodeModalVisible(true)
            }}
          >
            编辑
          </Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => onDeletePlotNode(record.id)}>
            删除
          </Button>
        </>
      ),
    },
  ]

  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Spin size="large" />
        </div>
      </Card>
    )
  }

  return (
    <Card title="情节规划">
      {progress && (
        <>
          <Row gutter={16}>
            <Col span={6}>
              <Statistic title="情节线总数" value={progress.plot_lines.total} />
            </Col>
            <Col span={6}>
              <Statistic title="主线数量" value={progress.plot_lines.main} />
            </Col>
            <Col span={6}>
              <Statistic title="情节节点" value={progress.nodes.total} />
            </Col>
            <Col span={6}>
              <Statistic
                title="完成率"
                value={progress.nodes.completion_rate * 100}
                suffix="%"
              />
            </Col>
          </Row>
          <Divider />
        </>
      )}

      <Tabs defaultActiveKey="outline">
        <TabPane tab="情节大纲" key="outline">
          {outline ? (
            <Card>
              <p><strong>标题:</strong> {outline.title}</p>
              {outline.premise && <p><strong>前提:</strong> {outline.premise}</p>}
              {outline.theme && <p><strong>主题:</strong> {outline.theme}</p>}
              {outline.beginning && <p><strong>开端:</strong> {outline.beginning}</p>}
              {outline.middle && <p><strong>发展:</strong> {outline.middle}</p>}
              {outline.climax && <p><strong>高潮:</strong> {outline.climax}</p>}
              {outline.ending && <p><strong>结局:</strong> {outline.ending}</p>}
              {outline.total_chapters && <p><strong>总章节:</strong> {outline.total_chapters}</p>}
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => {
                  outlineForm.setFieldsValue({
                    title: outline.title,
                    premise: outline.premise ?? undefined,
                    theme: outline.theme ?? undefined,
                    act_structure: outline.act_structure ?? undefined,
                    beginning: outline.beginning ?? undefined,
                    middle: outline.middle ?? undefined,
                    climax: outline.climax ?? undefined,
                    ending: outline.ending ?? undefined,
                    total_chapters: outline.total_chapters ?? undefined,
                    notes: outline.notes ?? undefined,
                    metadata: outline.metadata ?? undefined,
                  })
                  setOutlineModalVisible(true)
                }}
              >
                编辑大纲
              </Button>
            </Card>
          ) : (
            <Empty description="暂无情节大纲">
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setOutlineModalVisible(true)}>
                创建大纲
              </Button>
            </Empty>
          )}
        </TabPane>

        <TabPane tab="情节线" key="plotLines">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ marginBottom: 16 }}
            onClick={() => {
              setEditingPlotLine(null)
              plotLineForm.resetFields()
              setPlotLineModalVisible(true)
            }}
          >
            新建情节线
          </Button>
          <Table columns={plotLineColumns} dataSource={plotLines} rowKey="id" />
        </TabPane>

        <TabPane tab="情节节点" key="plotNodes">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ marginBottom: 16 }}
            onClick={() => {
              setEditingPlotNode(null)
              plotNodeForm.resetFields()
              setPlotNodeModalVisible(true)
            }}
          >
            新建情节节点
          </Button>
          <Table columns={plotNodeColumns} dataSource={plotNodes} rowKey="id" />
        </TabPane>

        <TabPane tab="情节建议" key="suggestions">
          <Button
            type="primary"
            icon={<BulbOutlined />}
            style={{ marginBottom: 16 }}
            onClick={() => setSuggestionModalVisible(true)}
          >
            生成情节建议
          </Button>
          {suggestions.length > 0 && (
            <List
              dataSource={suggestions}
              renderItem={(item) => (
                <List.Item>
                  <Card style={{ width: '100%' }}>
                    <h4>{item.title}</h4>
                    <p>{item.description}</p>
                    <p><strong>影响:</strong> {item.impact}</p>
                  </Card>
                </List.Item>
              )}
            />
          )}
        </TabPane>
      </Tabs>

      <Modal
        title={outline ? '编辑大纲' : '创建大纲'}
        open={outlineModalVisible}
        onCancel={() => setOutlineModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form form={outlineForm} layout="vertical" onFinish={onSaveOutline}>
          <Form.Item label="标题" name="title" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="请输入大纲标题" />
          </Form.Item>
          <Form.Item label="故事前提" name="premise">
            <TextArea rows={2} placeholder="故事的核心前提" />
          </Form.Item>
          <Form.Item label="主题" name="theme">
            <Input placeholder="故事主题" />
          </Form.Item>
          <Form.Item label="开端" name="beginning">
            <TextArea rows={2} placeholder="故事开端" />
          </Form.Item>
          <Form.Item label="发展" name="middle">
            <TextArea rows={2} placeholder="故事发展" />
          </Form.Item>
          <Form.Item label="高潮" name="climax">
            <TextArea rows={2} placeholder="故事高潮" />
          </Form.Item>
          <Form.Item label="结局" name="ending">
            <TextArea rows={2} placeholder="故事结局" />
          </Form.Item>
          <Form.Item label="总章节数" name="total_chapters">
            <Input type="number" placeholder="计划总章节数" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">保存</Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingPlotLine ? '编辑情节线' : '新建情节线'}
        open={plotLineModalVisible}
        onCancel={() => {
          setPlotLineModalVisible(false)
          setEditingPlotLine(null)
        }}
        footer={null}
      >
        <Form form={plotLineForm} layout="vertical" onFinish={onSavePlotLine}>
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="情节线名称" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <TextArea rows={2} placeholder="情节线描述" />
          </Form.Item>
          <Form.Item label="类型" name="line_type">
            <Select>
              <Option value="main">主线</Option>
              <Option value="sub">支线</Option>
              <Option value="character">角色线</Option>
              <Option value="background">背景线</Option>
            </Select>
          </Form.Item>
          <Form.Item label="起始章节" name="start_chapter">
            <Input type="number" placeholder="起始章节号" />
          </Form.Item>
          <Form.Item label="结束章节" name="end_chapter">
            <Input type="number" placeholder="结束章节号" />
          </Form.Item>
          <Form.Item label="重要程度" name="importance">
            <Select>
              <Option value={1}>1 - 最低</Option>
              <Option value={2}>2</Option>
              <Option value={3}>3 - 中等</Option>
              <Option value={4}>4</Option>
              <Option value={5}>5 - 最高</Option>
            </Select>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">保存</Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingPlotNode ? '编辑情节节点' : '新建情节节点'}
        open={plotNodeModalVisible}
        onCancel={() => {
          setPlotNodeModalVisible(false)
          setEditingPlotNode(null)
        }}
        footer={null}
      >
        <Form form={plotNodeForm} layout="vertical" onFinish={onSavePlotNode}>
          <Form.Item label="情节线ID" name="plot_line_id" rules={[{ required: true, message: '请输入情节线ID' }]}>
            <Select>
              {plotLines.map((line) => (
                <Option key={line.id} value={line.id}>{line.name}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="标题" name="title" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="节点标题" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <TextArea rows={2} placeholder="节点描述" />
          </Form.Item>
          <Form.Item label="章节号" name="chapter_number">
            <Input type="number" placeholder="所在章节" />
          </Form.Item>
          <Form.Item label="顺序" name="sequence">
            <Input type="number" placeholder="节点顺序" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">保存</Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="生成情节建议"
        open={suggestionModalVisible}
        onCancel={() => setSuggestionModalVisible(false)}
        footer={null}
      >
        <Form form={suggestionForm} layout="vertical" onFinish={onGenerateSuggestions}>
          <Form.Item label="当前上下文" name="context" rules={[{ required: true, message: '请输入上下文' }]}>
            <TextArea rows={4} placeholder="请描述当前的情节上下文..." />
          </Form.Item>
          <Form.Item label="目标章节" name="chapter_number" rules={[{ required: true, message: '请输入章节号' }]}>
            <Input type="number" placeholder="目标章节号" />
          </Form.Item>
          <Form.Item label="情节线" name="plot_line_id">
            <Select allowClear placeholder="选择情节线（可选）">
              {plotLines.map((line) => (
                <Option key={line.id} value={line.id}>{line.name}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">生成建议</Button>
          </Form.Item>
        </Form>
      </Modal>

      <div style={{ marginTop: 16 }}>
        <Button onClick={() => navigate(`/novels/${novelId}`)}>返回小说详情</Button>
      </div>
    </Card>
  )
}

export default PlotPlanning
