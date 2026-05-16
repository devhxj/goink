import { useState, useEffect } from 'react'
import {
  Table, Button, Space, Tag, Select, message, Popconfirm, Modal, Form,
  InputNumber, Input, Card, Row, Col, Statistic, Tabs, Tooltip, Descriptions,
  Radio, Spin, Alert,
} from 'antd'
import {
  PlusOutlined, EditOutlined,
  ClockCircleOutlined, PushpinOutlined, FileTextOutlined,
  MessageOutlined, LinkOutlined, EyeOutlined, UnorderedListOutlined,
  AppstoreOutlined,
} from '@ant-design/icons'
import { useParams } from 'react-router-dom'
import { timelineApi, type TimelineListParams } from '@/services/timelineService'
import { getErrorMessage } from '@/types/error'
import type {
  TimelineEntry,
  TimelineEntryCategory,
  TimelineEntryStatus,
  TimeHorizon,
  TimelineEntryCreate,
  TimelineEntryUpdate,
  TimelineEntryStatusUpdate,
  TimelineStats,
} from '@/types/timeline'
import dayjs from 'dayjs'

const { Option } = Select
const { TextArea } = Input

type ViewMode = 'list' | 'timeline'

interface StatusConfig {
  color: string
  text: string
}

interface CategoryConfig {
  icon: React.ReactNode
  color: string
  text: string
}

interface TimeHorizonConfig {
  color: string
  text: string
}

function StoryTracker() {
  const { novelId } = useParams<{ novelId: string }>()
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<TimelineStats | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [categoryFilter, setCategoryFilter] = useState<TimelineEntryCategory | undefined>()
  const [statusFilter, setStatusFilter] = useState<TimelineEntryStatus | undefined>()
  const [timeHorizonFilter, setTimeHorizonFilter] = useState<TimeHorizon | undefined>()
  const [searchKeyword, setSearchKeyword] = useState('')
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [statusModalVisible, setStatusModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<TimelineEntry | null>(null)
  const [createForm] = Form.useForm<TimelineEntryCreate>()
  const [editForm] = Form.useForm<TimelineEntryUpdate>()
  const [statusForm] = Form.useForm<TimelineEntryStatusUpdate>()

  useEffect(() => {
    if (novelId) {
      loadEntries()
      loadStats()
    }
  }, [page, pageSize, novelId, categoryFilter, statusFilter, timeHorizonFilter])

  const loadEntries = async () => {
    if (!novelId) return
    setLoading(true)
    try {
      const params: TimelineListParams = {
        page,
        page_size: pageSize,
        category: categoryFilter,
        status: statusFilter,
        time_horizon: timeHorizonFilter,
        search: searchKeyword || undefined,
      }
      const response = await timelineApi.getTimelineEntries(parseInt(novelId), params)
      if (response.success) {
        setEntries(response.data.items)
        setTotal(response.data.total)
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    if (!novelId) return
    try {
      const response = await timelineApi.getTimelineStats(parseInt(novelId))
      if (response.success) {
        setStats(response.data)
      }
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }

  const handleSearch = () => {
    setPage(1)
    loadEntries()
  }

  const handleCreate = async (values: TimelineEntryCreate) => {
    if (!novelId) return
    try {
      const response = await timelineApi.createTimelineEntry(parseInt(novelId), values)
      if (response.success) {
        message.success('条目创建成功')
        setCreateModalVisible(false)
        createForm.resetFields()
        loadEntries()
        loadStats()
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    }
  }

  const handleEdit = async (values: TimelineEntryUpdate) => {
    if (!novelId || !selectedEntry) return
    try {
      const response = await timelineApi.updateTimelineEntry(
        parseInt(novelId),
        selectedEntry.id,
        values
      )
      if (response.success) {
        message.success('条目更新成功')
        setEditModalVisible(false)
        editForm.resetFields()
        setSelectedEntry(null)
        loadEntries()
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    }
  }

  const handleStatusChange = async (values: TimelineEntryStatusUpdate) => {
    if (!novelId || !selectedEntry) return
    try {
      const response = await timelineApi.updateTimelineEntryStatus(
        parseInt(novelId),
        selectedEntry.id,
        values
      )
      if (response.success) {
        message.success('状态更新成功')
        setStatusModalVisible(false)
        statusForm.resetFields()
        setSelectedEntry(null)
        loadEntries()
        loadStats()
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    }
  }

  const handleDelete = async (entryId: number) => {
    if (!novelId) return
    try {
      const response = await timelineApi.deleteTimelineEntry(parseInt(novelId), entryId)
      if (response.success) {
        message.success('条目已删除')
        loadEntries()
        loadStats()
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    }
  }

  const getStatusTag = (status: TimelineEntryStatus): React.ReactNode => {
    const statusMap: Record<TimelineEntryStatus, StatusConfig> = {
      pending: { color: 'warning', text: '待处理' },
      active: { color: 'processing', text: '当前活跃' },
      completed: { color: 'success', text: '已完成' },
      resolved: { color: 'cyan', text: '已解决' },
      abandoned: { color: 'default', text: '已放弃' },
      deferred: { color: 'orange', text: '已推迟' },
    }
    const config = statusMap[status]
    return <Tag color={config.color}>{config.text}</Tag>
  }

  const getCategoryTag = (category: TimelineEntryCategory): React.ReactNode => {
    const categoryMap: Record<TimelineEntryCategory, CategoryConfig> = {
      foreshadowing: { icon: <PushpinOutlined />, color: 'red', text: '伏笔' },
      chapter_plan: { icon: <FileTextOutlined />, color: 'blue', text: '规划' },
      user_directive: { icon: <MessageOutlined />, color: 'green', text: '指令' },
      plot_node: { icon: <LinkOutlined />, color: 'purple', text: '情节' },
    }
    const config = categoryMap[category]
    return (
      <Tag icon={config.icon} color={config.color}>
        {config.text}
      </Tag>
    )
  }

  const getTimeHorizonTag = (horizon: TimeHorizon | null): React.ReactNode => {
    if (!horizon) return <Tag>未设置</Tag>
    const horizonMap: Record<TimeHorizon, TimeHorizonConfig> = {
      next: { color: 'green', text: '下一章' },
      near_term: { color: 'gold', text: '近期' },
      long_term: { color: 'default', text: '远期' },
      undefined: { color: 'default', text: '未确定' },
    }
    const config = horizonMap[horizon]
    return <Tag color={config.color}>{config.text}</Tag>
  }

  const getStatusActions = (entry: TimelineEntry) => {
    switch (entry.status) {
      case 'pending':
        return (
          <Space>
            <Button size="small" onClick={() => openStatusModal(entry, 'active')}>激活</Button>
            <Button size="small" onClick={() => openStatusModal(entry, 'completed')}>完成</Button>
            <Button size="small" onClick={() => openStatusModal(entry, 'abandoned')}>放弃</Button>
          </Space>
        )
      case 'active':
        return (
          <Space>
            <Button size="small" onClick={() => openStatusModal(entry, 'completed')}>完成</Button>
            <Button size="small" onClick={() => openStatusModal(entry, 'deferred')}>推迟</Button>
            <Button size="small" onClick={() => openStatusModal(entry, 'resolved')}>解决</Button>
          </Space>
        )
      case 'deferred':
        return (
          <Button size="small" onClick={() => openStatusModal(entry, 'active')}>重新激活</Button>
        )
      case 'abandoned':
        return (
          <Button size="small" onClick={() => openStatusModal(entry, 'active')}>重新激活</Button>
        )
      default:
        return null
    }
  }

  const openStatusModal = (entry: TimelineEntry, targetStatus: TimelineEntryStatus) => {
    setSelectedEntry(entry)
    statusForm.setFieldsValue({ status: targetStatus })
    setStatusModalVisible(true)
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 70,
    },
    {
      title: '类型',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (category: TimelineEntryCategory) => getCategoryTag(category),
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title: string, record: TimelineEntry) => (
        <a onClick={() => { setSelectedEntry(record); setDetailModalVisible(true) }}>{title}</a>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: TimelineEntryStatus) => getStatusTag(status),
    },
    {
      title: '目标章节',
      dataIndex: 'target_chapter',
      key: 'target_chapter',
      width: 100,
      render: (chapter: number | null) => (chapter ? `第${chapter}章` : '-'),
    },
    {
      title: '时间范围',
      dataIndex: 'time_horizon',
      key: 'time_horizon',
      width: 100,
      render: (horizon: TimeHorizon | null) => getTimeHorizonTag(horizon),
    },
    {
      title: '重要度',
      dataIndex: 'importance',
      key: 'importance',
      width: 120,
      render: (importance: number) => (
        <Space>
          {[1, 2, 3, 4, 5].map((star) => (
            <span key={star} style={{ color: star <= importance ? '#faad14' : '#d9d9d9' }}>
              ★
            </span>
          ))}
        </Space>
      ),
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 90,
      render: (source: string) => {
        const sourceMap: Record<string, { color: string; text: string }> = {
          ai_generated: { color: 'blue', text: 'AI生成' },
          user_created: { color: 'green', text: '用户创建' },
          user_edited: { color: 'orange', text: '用户编辑' },
        }
        const config = sourceMap[source] || { color: 'default', text: source }
        return <Tag color={config.color}>{config.text}</Tag>
      },
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 60,
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      render: (_: unknown, record: TimelineEntry) => (
        <Space wrap>
          <Tooltip title="查看详情">
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => { setSelectedEntry(record); setDetailModalVisible(true) }} />
          </Tooltip>
          <Tooltip title="编辑">
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => { setSelectedEntry(record); editForm.setFieldsValue({ title: record.title, description: record.description ?? undefined, status: record.status, detail_json: record.detail_json ?? undefined, target_chapter: record.target_chapter ?? undefined, time_horizon: record.time_horizon ?? undefined, importance: record.importance, tags: record.tags ?? undefined }); setEditModalVisible(true) }} />
          </Tooltip>
          {getStatusActions(record)}
          <Popconfirm title="确定删除这个条目吗？" onConfirm={() => handleDelete(record.id)} okText="确定" cancelText="取消">
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const categoryTabs = [
    { key: '', label: '全部' },
    { key: 'foreshadowing', label: <><PushpinOutlined /> 伏笔</> },
    { key: 'chapter_plan', label: <><FileTextOutlined /> 规划</> },
    { key: 'user_directive', label: <><MessageOutlined /> 指令</> },
    { key: 'plot_node', label: <><LinkOutlined /> 情节</> },
  ]

  return (
    <div>
      <Card
        title={
          <Space>
            <ClockCircleOutlined />
            <span>故事追踪</span>
          </Space>
        }
        extra={
          <Space>
            <Radio.Group
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value)}
              size="small"
            >
              <Radio.Button value="list"><UnorderedListOutlined /> 列表</Radio.Button>
              <Radio.Button value="timeline"><AppstoreOutlined /> 时间轴</Radio.Button>
            </Radio.Group>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
              添加条目
            </Button>
          </Space>
        }
      >
        {stats && (
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Statistic
                title="未解决伏笔"
                value={stats.foreshadowing}
                valueStyle={{ color: stats.foreshadowing > 0 ? '#ff4d4f' : '#52c41a' }}
                prefix={<PushpinOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="未完成规划"
                value={stats.chapter_plan}
                valueStyle={{ color: stats.chapter_plan > 0 ? '#faad14' : '#52c41a' }}
                prefix={<FileTextOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="活跃指令"
                value={stats.user_directive}
                valueStyle={{ color: stats.user_directive > 0 ? '#1890ff' : '#52c41a' }}
                prefix={<MessageOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="总条目数"
                value={total}
                prefix={<ClockCircleOutlined />}
              />
            </Col>
          </Row>
        )}

        <Tabs
          activeKey={categoryFilter || ''}
          onChange={(key) => { setCategoryFilter((key || undefined) as TimelineEntryCategory | undefined); setPage(1) }}
          items={categoryTabs.map(tab => ({ key: tab.key, label: tab.label }))}
          style={{ marginBottom: 16 }}
        />

        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            placeholder="状态筛选"
            style={{ width: 140 }}
            allowClear
            value={statusFilter}
            onChange={(value) => { setStatusFilter(value); setPage(1) }}
          >
            <Option value="pending">待处理</Option>
            <Option value="active">当前活跃</Option>
            <Option value="completed">已完成</Option>
            <Option value="resolved">已解决</Option>
            <Option value="abandoned">已放弃</Option>
            <Option value="deferred">已推迟</Option>
          </Select>
          <Select
            placeholder="时间范围"
            style={{ width: 130 }}
            allowClear
            value={timeHorizonFilter}
            onChange={(value) => { setTimeHorizonFilter(value); setPage(1) }}
          >
            <Option value="next">下一章</Option>
            <Option value="near_term">近期</Option>
            <Option value="long_term">远期</Option>
            <Option value="undefined">未确定</Option>
          </Select>
          <Input.Search
            placeholder="搜索标题或描述"
            allowClear
            style={{ width: 240 }}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onSearch={handleSearch}
          />
        </Space>

        {viewMode === 'list' ? (
          <Table
            columns={columns}
            dataSource={entries}
            rowKey="id"
            loading={loading}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p, ps) => { setPage(p); setPageSize(ps) },
            }}
            scroll={{ x: 1200 }}
          />
        ) : (
          <TimelineView entries={entries} loading={loading} onEntryClick={(entry) => { setSelectedEntry(entry); setDetailModalVisible(true) }} />
        )}
      </Card>

      <Modal
        title="添加时间线条目"
        open={createModalVisible}
        onCancel={() => { setCreateModalVisible(false); createForm.resetFields() }}
        footer={null}
        width={600}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item label="分类" name="category" rules={[{ required: true, message: '请选择分类' }]}>
            <Select placeholder="选择条目分类">
              <Option value="foreshadowing"><PushpinOutlined /> 伏笔/钩子</Option>
              <Option value="chapter_plan"><FileTextOutlined /> 章节安排</Option>
              <Option value="plot_node"><LinkOutlined /> 情节节点</Option>
              <Option value="user_directive"><MessageOutlined /> 用户指令</Option>
            </Select>
          </Form.Item>
          <Form.Item label="标题" name="title" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="请输入标题（最长255字符）" maxLength={255} />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <TextArea rows={3} placeholder="请输入详细描述" />
          </Form.Item>
          <Form.Item label="目标章节号" name="target_chapter">
            <InputNumber min={1} style={{ width: '100%' }} placeholder="可选，指定目标回收/完成章节" />
          </Form.Item>
          <Form.Item label="时间范围" name="time_horizon">
            <Select placeholder="选择时间范围" allowClear>
              <Option value="next">下一章</Option>
              <Option value="near_term">近期(3-5章)</Option>
              <Option value="long_term">远期方向</Option>
              <Option value="undefined">未确定</Option>
            </Select>
          </Form.Item>
          <Form.Item label="重要度 (1-5)" name="importance" initialValue={3}>
            <InputNumber min={1} max={5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="标签" name="tags">
            <Select mode="tags" placeholder="输入标签后按回车添加" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">创建</Button>
              <Button onClick={() => setCreateModalVisible(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑条目"
        open={editModalVisible}
        onCancel={() => { setEditModalVisible(false); editForm.resetFields(); setSelectedEntry(null) }}
        footer={null}
        width={600}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item label="标题" name="title" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="请输入标题" maxLength={255} />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <TextArea rows={3} placeholder="请输入详细描述" />
          </Form.Item>
          <Form.Item label="状态" name="status">
            <Select placeholder="选择状态">
              <Option value="pending">待处理</Option>
              <Option value="active">当前活跃</Option>
              <Option value="completed">已完成</Option>
              <Option value="resolved">已解决</Option>
              <Option value="abandoned">已放弃</Option>
              <Option value="deferred">已推迟</Option>
            </Select>
          </Form.Item>
          <Form.Item label="目标章节号" name="target_chapter">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="时间范围" name="time_horizon">
            <Select placeholder="选择时间范围" allowClear>
              <Option value="next">下一章</Option>
              <Option value="near_term">近期(3-5章)</Option>
              <Option value="long_term">远期方向</Option>
              <Option value="undefined">未确定</Option>
            </Select>
          </Form.Item>
          <Form.Item label="重要度 (1-5)" name="importance">
            <InputNumber min={1} max={5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="标签" name="tags">
            <Select mode="tags" placeholder="输入标签后按回车添加" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">保存</Button>
              <Button onClick={() => { setEditModalVisible(false); editForm.resetFields(); setSelectedEntry(null) }}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="更新状态"
        open={statusModalVisible}
        onCancel={() => { setStatusModalVisible(false); statusForm.resetFields(); setSelectedEntry(null) }}
        footer={null}
        width={480}
      >
        <Form form={statusForm} layout="vertical" onFinish={handleStatusChange}>
          <Form.Item label="目标状态" name="status" rules={[{ required: true }]}>
            <Select disabled>
              <Option value="pending">待处理</Option>
              <Option value="active">当前活跃</Option>
              <Option value="completed">已完成</Option>
              <Option value="resolved">已解决</Option>
              <Option value="abandoned">已放弃</Option>
              <Option value="deferred">已推迟</Option>
            </Select>
          </Form.Item>
          {(statusForm.getFieldValue('status') === 'resolved' || statusForm.getFieldValue('status') === 'completed') && (
            <>
              <Form.Item label="关联章节ID" name="resolved_chapter_id">
                <InputNumber min={1} style={{ width: '100%' }} placeholder="解决/完成的章节号" />
              </Form.Item>
              <Form.Item label="说明备注" name="resolution_notes">
                <TextArea rows={3} placeholder="解决或完成时的说明" />
              </Form.Item>
            </>
          )}
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">确认</Button>
              <Button onClick={() => { setStatusModalVisible(false); statusForm.resetFields(); setSelectedEntry(null) }}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="条目详情"
        open={detailModalVisible}
        onCancel={() => { setDetailModalVisible(false); setSelectedEntry(null) }}
        footer={null}
        width={700}
      >
        {selectedEntry && (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="ID">{selectedEntry.id}</Descriptions.Item>
            <Descriptions.Item label="分类">{getCategoryTag(selectedEntry.category)}</Descriptions.Item>
            <Descriptions.Item label="标题" span={2}><strong>{selectedEntry.title}</strong></Descriptions.Item>
            <Descriptions.Item label="状态">{getStatusTag(selectedEntry.status)}</Descriptions.Item>
            <Descriptions.Item label="重要度">
              {[1, 2, 3, 4, 5].map((s) => (
                <span key={s} style={{ color: s <= selectedEntry.importance ? '#faad14' : '#d9d9d9' }}>★</span>
              ))}
            </Descriptions.Item>
            <Descriptions.Item label="来源">
              <Tag color={selectedEntry.source === 'ai_generated' ? 'blue' : selectedEntry.source === 'user_created' ? 'green' : 'orange'}>
                {selectedEntry.source === 'ai_generated' ? 'AI生成' : selectedEntry.source === 'user_created' ? '用户创建' : '用户编辑'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="版本">v{selectedEntry.version}{selectedEntry.last_editor ? ` (${selectedEntry.last_editor})` : ''}</Descriptions.Item>
            <Descriptions.Item label="目标章节">{selectedEntry.target_chapter ? `第${selectedEntry.target_chapter}章` : '-'}</Descriptions.Item>
            <Descriptions.Item label="时间范围">{getTimeHorizonTag(selectedEntry.time_horizon)}</Descriptions.Item>
            <Descriptions.Item label="来源章节">{selectedEntry.source_chapter_id || '-'}</Descriptions.Item>
            <Descriptions.Item label="解决章节">{selectedEntry.resolved_chapter_id || '-'}</Descriptions.Item>
            {selectedEntry.tags && selectedEntry.tags.length > 0 && (
              <Descriptions.Item label="标签" span={2}>
                <Space wrap>{selectedEntry.tags.map(tag => <Tag key={tag}>{tag}</Tag>)}</Space>
              </Descriptions.Item>
            )}
            {selectedEntry.description && (
              <Descriptions.Item label="描述" span={2}>{selectedEntry.description}</Descriptions.Item>
            )}
            {selectedEntry.detail_json && (
              <Descriptions.Item label="结构化详情" span={2}>
                <pre style={{ maxHeight: 200, overflow: 'auto', background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                  {JSON.stringify(selectedEntry.detail_json, null, 2)}
                </pre>
              </Descriptions.Item>
            )}
            {selectedEntry.original_ai_output && (
              <Descriptions.Item label="AI原始输出" span={2}>
                <Alert
                  type="info"
                  message="此条目由AI生成后被用户修改过"
                  description={
                    <pre style={{ maxHeight: 150, overflow: 'auto' }}>
                      {JSON.stringify(selectedEntry.original_ai_output, null, 2)}
                    </pre>
                  }
                />
              </Descriptions.Item>
            )}
            <Descriptions.Item label="创建时间">{dayjs(selectedEntry.created_at).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{dayjs(selectedEntry.updated_at).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
            {selectedEntry.resolved_at && (
              <Descriptions.Item label="解决时间" span={2}>{dayjs(selectedEntry.resolved_at).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}

function TimelineView({
  entries,
  loading,
  onEntryClick,
}: {
  entries: TimelineEntry[]
  loading: boolean
  onEntryClick: (entry: TimelineEntry) => void
}) {
  const groupedByChapter = entries.reduce<Record<number, TimelineEntry[]>>((acc, entry) => {
    const chapter = entry.target_chapter ?? 9999
    if (!acc[chapter]) acc[chapter] = []
    acc[chapter].push(entry)
    return acc
  }, {})

  const sortedChapters = Object.keys(groupedByChapter)
    .map(Number)
    .sort((a, b) => a - b)

  const getCategoryIcon = (category: TimelineEntryCategory) => {
    switch (category) {
      case 'foreshadowing': return <PushpinOutlined style={{ color: '#ff4d4f' }} />
      case 'chapter_plan': return <FileTextOutlined style={{ color: '#1890ff' }} />
      case 'user_directive': return <MessageOutlined style={{ color: '#52c41a' }} />
      case 'plot_node': return <LinkOutlined style={{ color: '#722ed1' }} />
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
  }

  if (entries.length === 0) {
    return <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无数据</div>
  }

  return (
    <div style={{ position: 'relative', paddingLeft: 30 }}>
      <div style={{
        position: 'absolute',
        left: 8,
        top: 10,
        bottom: 10,
        width: 2,
        background: '#e8e8e8',
      }} />
      {sortedChapters.map((chapter) => (
        <div key={chapter} style={{ marginBottom: 24, position: 'relative' }}>
          <div style={{
            position: 'absolute',
            left: -26,
            top: 4,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#1890ff',
            border: '2px solid #fff',
            boxShadow: '0 0 0 2px #1890ff',
          }} />
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: '#1890ff' }}>
            {chapter === 9999 ? '未设定章节' : `第 ${chapter} 章`}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {groupedByChapter[chapter].map((entry) => (
              <Card
                key={entry.id}
                size="small"
                hoverable
                style={{ width: 280, cursor: 'pointer' }}
                onClick={() => onEntryClick(entry)}
              >
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Space>
                    {getCategoryIcon(entry.category)}
                    <span style={{ fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.title}
                    </span>
                  </Space>
                  <Space size={4} style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Tag
                      color={
                        entry.status === 'pending' ? 'warning' :
                        entry.status === 'active' ? 'processing' :
                        entry.status === 'completed' ? 'success' :
                        entry.status === 'resolved' ? 'cyan' :
                        entry.status === 'abandoned' ? 'default' : 'orange'
                      }
                      style={{ margin: 0, fontSize: 11 }}
                    >
                      {entry.status === 'pending' ? '待处理' :
                       entry.status === 'active' ? '活跃' :
                       entry.status === 'completed' ? '已完成' :
                       entry.status === 'resolved' ? '已解决' :
                       entry.status === 'abandoned' ? '已放弃' : '推迟'}
                    </Tag>
                    <span style={{ fontSize: 12, color: '#faad14' }}>
                      {'★'.repeat(entry.importance)}{'☆'.repeat(5 - entry.importance)}
                    </span>
                  </Space>
                  {entry.description && (
                    <div style={{ fontSize: 12, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.description}
                    </div>
                  )}
                  {entry.time_horizon && entry.time_horizon !== 'undefined' && (
                    <Tag
                      color={entry.time_horizon === 'next' ? 'green' : entry.time_horizon === 'near_term' ? 'gold' : 'default'}
                      style={{ fontSize: 11 }}
                    >
                      {entry.time_horizon === 'next' ? '下一章' : entry.time_horizon === 'near_term' ? '近期' : '远期'}
                    </Tag>
                  )}
                </Space>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default StoryTracker
