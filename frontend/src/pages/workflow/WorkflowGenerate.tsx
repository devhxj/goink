import { useState, useEffect } from 'react'
import { Card, Form, Input, Button, Select, message, Spin, Alert, Divider, Steps, Tag, Table, Row, Col, Statistic } from 'antd'
import { useParams, useNavigate } from 'react-router-dom'
import { workflowApi } from '@/services/workflowService'
import { getErrorMessage } from '@/types/error'
import type { WorkflowState, WorkflowTask, WorkflowHealth } from '@/types/workflow'

const { Option } = Select

interface GenerateFormValues {
  chapter_number: number
  target_length?: number
  style?: string
}

function WorkflowGenerate() {
  const [loading, setLoading] = useState(false)
  const [healthLoading, setHealthLoading] = useState(true)
  const [health, setHealth] = useState<WorkflowHealth | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [workflowState, setWorkflowState] = useState<WorkflowState | null>(null)
  const [tasks, setTasks] = useState<WorkflowTask[]>([])
  const [polling, setPolling] = useState(false)
  const [form] = Form.useForm<GenerateFormValues>()
  const { novelId } = useParams<{ novelId: string }>()
  const navigate = useNavigate()

  useEffect(() => {
    checkHealth()
    loadTasks()
  }, [novelId])

  useEffect(() => {
    if (!polling || !taskId) return
    
    const interval = setInterval(async () => {
      try {
        const response = await workflowApi.getTaskStatus(taskId)
        if (response.success) {
          setWorkflowState(response.data)
          if (response.data.status === 'completed' || response.data.status === 'failed') {
            setPolling(false)
            loadTasks()
          }
        }
      } catch (error) {
        console.error('轮询任务状态失败:', getErrorMessage(error))
        setPolling(false)
      }
    }, 2000)
    
    return () => clearInterval(interval)
  }, [polling, taskId])

  const checkHealth = async () => {
    setHealthLoading(true)
    try {
      const response = await workflowApi.checkHealth()
      if (response.success) {
        setHealth(response.data)
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setHealthLoading(false)
    }
  }

  const loadTasks = async () => {
    if (!novelId) return
    try {
      const response = await workflowApi.listNovelWorkflows(parseInt(novelId))
      if (response.success) {
        setTasks(response.data.items)
      }
    } catch (error) {
      console.error('加载任务列表失败:', getErrorMessage(error))
    }
  }

  const onGenerate = async (values: GenerateFormValues) => {
    if (!novelId) return
    setLoading(true)
    try {
      const response = await workflowApi.generateChapter(parseInt(novelId), {
        chapter_number: values.chapter_number,
        target_length: values.target_length || 3000,
        style: values.style || 'narrative',
      })
      if (response.success) {
        setTaskId(response.data.task_id)
        setPolling(true)
        message.success('工作流任务已提交')
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const getStatusStep = (status: string) => {
    switch (status) {
      case 'initialized':
        return 0
      case 'generating':
        return 1
      case 'completed':
        return 3
      case 'failed':
        return -1
      default:
        return 0
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success'
      case 'generating':
        return 'processing'
      case 'failed':
        return 'error'
      default:
        return 'default'
    }
  }

  const taskColumns = [
    {
      title: '任务ID',
      dataIndex: 'task_id',
      key: 'task_id',
      width: 200,
      ellipsis: true,
    },
    {
      title: '类型',
      dataIndex: 'task_type',
      key: 'task_type',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <Tag color={getStatusColor(status)}>{status}</Tag>,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: WorkflowTask) => (
        <Button type="link" onClick={() => viewTaskStatus(record.task_id)}>
          查看详情
        </Button>
      ),
    },
  ]

  const viewTaskStatus = async (id: string) => {
    try {
      const response = await workflowApi.getTaskStatus(id)
      if (response.success) {
        setTaskId(id)
        setWorkflowState(response.data)
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    }
  }

  if (healthLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Spin size="large" />
        </div>
      </Card>
    )
  }

  return (
    <Card title="LangGraph工作流生成">
      {health && (
        <Alert
          message={health.workflow_ready ? '工作流系统就绪' : '工作流系统未就绪'}
          description={
            <div>
              <p>组件状态：</p>
              <ul>
                {Object.entries(health.components).map(([key, value]) => (
                  <li key={key}>
                    {key}: <Tag color={value === 'ready' ? 'success' : 'error'}>{value}</Tag>
                  </li>
                ))}
              </ul>
            </div>
          }
          type={health.workflow_ready ? 'success' : 'warning'}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Alert
        message="工作流说明"
        description="LangGraph工作流会自动执行：准备上下文 → 生成内容 → 审核内容 → 一致性检查 → 保存章节 → 更新记忆。如果审核或一致性检查不通过，会自动重试（最多3次）。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Form form={form} layout="vertical" onFinish={onGenerate}>
        <Form.Item label="章节号" name="chapter_number" rules={[{ required: true, message: '请输入章节号' }]}>
          <Input type="number" placeholder="请输入章节号" />
        </Form.Item>
        <Form.Item label="目标字数" name="target_length">
          <Input type="number" placeholder="默认3000字" />
        </Form.Item>
        <Form.Item label="写作风格" name="style">
          <Select placeholder="请选择写作风格">
            <Option value="narrative">叙述性</Option>
            <Option value="descriptive">描写性</Option>
            <Option value="dialogue">对话式</Option>
            <Option value="poetic">诗意</Option>
            <Option value="dramatic">戏剧性</Option>
          </Select>
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading || polling} disabled={!health?.workflow_ready}>
            {polling ? '生成中...' : '开始工作流生成'}
          </Button>
        </Form.Item>
      </Form>

      {workflowState && (
        <>
          <Divider>工作流状态</Divider>
          <Card>
            <Steps
              current={getStatusStep(workflowState.status)}
              status={workflowState.status === 'failed' ? 'error' : 'process'}
              items={[
                { title: '初始化', description: '准备上下文' },
                { title: '生成中', description: 'AI创作内容' },
                { title: '审核检查', description: '一致性验证' },
                { title: '完成', description: '保存并索引' },
              ]}
            />
            <Divider />
            <Row gutter={16}>
              <Col span={6}>
                <Statistic title="状态" value={workflowState.status} />
              </Col>
              <Col span={6}>
                <Statistic title="迭代次数" value={`${workflowState.iteration}/${workflowState.max_iterations}`} />
              </Col>
              <Col span={6}>
                <Statistic title="生成内容长度" value={workflowState.generated_content_length} suffix="字" />
              </Col>
            </Row>
            {workflowState.review_result && (
              <>
                <Divider>审核结果</Divider>
                <p>
                  通过: <Tag color={workflowState.review_result.approved ? 'success' : 'error'}>
                    {workflowState.review_result.approved ? '是' : '否'}
                  </Tag>
                </p>
                <p>评分: {workflowState.review_result.score}/10</p>
                <p>反馈: {workflowState.review_result.feedback}</p>
              </>
            )}
            {workflowState.consistency_result && (
              <>
                <Divider>一致性检查</Divider>
                <p>
                  通过: <Tag color={workflowState.consistency_result.passed ? 'success' : 'error'}>
                    {workflowState.consistency_result.passed ? '是' : '否'}
                  </Tag>
                </p>
                {workflowState.consistency_result.issues.length > 0 && (
                  <ul>
                    {workflowState.consistency_result.issues.map((issue, idx) => (
                      <li key={idx}>{issue.description}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {workflowState.error && (
              <Alert message="错误" description={workflowState.error} type="error" showIcon />
            )}
          </Card>
        </>
      )}

      <Divider>历史任务</Divider>
      <Table
        columns={taskColumns}
        dataSource={tasks}
        rowKey="task_id"
        pagination={{ pageSize: 10 }}
      />

      <div style={{ marginTop: 16 }}>
        <Button onClick={() => navigate(`/novels/${novelId}`)}>返回小说详情</Button>
      </div>
    </Card>
  )
}

export default WorkflowGenerate
