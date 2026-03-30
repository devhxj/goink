import { useState, useEffect, useCallback } from 'react'
import { Card, Form, Button, Select, message, Spin, Alert, Divider, Progress, Typography, Tag, Space, Input, Collapse } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, WarningOutlined } from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import { chapterApi } from '@/services/chapterService'
import { wsGenerationService } from '@/services/wsGenerationService'
import { generationApi } from '@/services/generationService'
import type { WSMessage, GenerationStyle, LLMModel } from '@/services/wsGenerationService'
import type { ModelOption, StyleOption } from '@/services/generationService'
import { getErrorMessage } from '@/types/error'
import type { ChapterDetail } from '@/types/chapter'

const { Option } = Select
const { Text } = Typography
const { TextArea } = Input
const { Panel } = Collapse

interface GenerateFormValues {
  target_length?: number
  model?: LLMModel
  style?: GenerationStyle
  use_langgraph?: boolean
  user_prompt?: string
  chapter_outline?: string
  key_events?: string
  focus_characters?: string
}

interface ReviewResult {
  approved: boolean
  score: number
  issues: string[]
}

interface ConsistencyResult {
  passed: boolean
  issues: string[]
}

function ChapterGenerate() {
  const [loading, setLoading] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [chapter, setChapter] = useState<ChapterDetail | null>(null)
  const [generatedContent, setGeneratedContent] = useState('')
  const [taskId, setTaskId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null)
  const [consistencyResult, setConsistencyResult] = useState<ConsistencyResult | null>(null)
  const [wordCount, setWordCount] = useState(0)
  const [models, setModels] = useState<ModelOption[]>([])
  const [styles, setStyles] = useState<StyleOption[]>([])
  const [form] = Form.useForm<GenerateFormValues>()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  useEffect(() => {
    loadConfig()
    if (id) {
      loadChapter(parseInt(id))
    }
  }, [id])

  useEffect(() => {
    if (chapter) {
      connectWebSocket()
    }
    return () => {
      wsGenerationService.disconnect()
    }
  }, [chapter])

  const loadConfig = async () => {
    try {
      const [modelsRes, stylesRes] = await Promise.all([
        generationApi.getModels(),
        generationApi.getStyles(),
      ])
      if (modelsRes.success) {
        setModels(modelsRes.data.models)
      }
      if (stylesRes.success) {
        setStyles(stylesRes.data.styles)
      }
    } catch (error) {
      console.error('Failed to load config:', error)
    }
  }

  const connectWebSocket = async () => {
    if (!chapter) return
    
    try {
      await wsGenerationService.connect(chapter.novel_id)
      setIsConnected(true)
      
      wsGenerationService.onMessage(handleWSMessage)
    } catch (error) {
      console.error('WebSocket connection failed:', error)
      message.warning('实时生成连接失败，将使用HTTP模式')
    }
  }

  const handleWSMessage = useCallback((msg: WSMessage) => {
    switch (msg.type) {
      case 'generation_started':
        setTaskId(msg.task_id)
        setIsGenerating(true)
        setProgress(0)
        setStatusMessage(`开始生成...`)
        setReviewResult(null)
        setConsistencyResult(null)
        setGeneratedContent('')
        break
        
      case 'generation_progress':
        setProgress(msg.progress)
        setStatusMessage(msg.message)
        break
        
      case 'content_chunk':
        setGeneratedContent(prev => prev + msg.chunk)
        setWordCount(msg.accumulated_length)
        break
        
      case 'review_result':
        setReviewResult({
          approved: msg.approved,
          score: msg.score,
          issues: msg.issues,
        })
        break
        
      case 'consistency_check':
        setConsistencyResult({
          passed: msg.passed,
          issues: msg.issues,
        })
        break
        
      case 'generation_completed':
        setIsGenerating(false)
        setProgress(100)
        setStatusMessage('生成完成！')
        setWordCount(msg.word_count)
        message.success(`生成成功，共${msg.word_count}字`)
        break
        
      case 'generation_failed':
        setIsGenerating(false)
        message.error(`生成失败: ${msg.error}`)
        break
    }
  }, [])

  const loadChapter = async (chapterId: number) => {
    setFetchLoading(true)
    try {
      const response = await chapterApi.getChapter(chapterId)
      if (response.success) {
        setChapter(response.data)
        form.setFieldsValue({
          target_length: 3000,
          model: 'deepseek-chat',
          style: 'narrative',
          use_langgraph: true,
        })
      }
    } catch (error) {
      message.error(getErrorMessage(error))
      navigate('/novels')
    } finally {
      setFetchLoading(false)
    }
  }

  const onGenerate = async (values: GenerateFormValues) => {
    if (!chapter) return
    
    setGeneratedContent('')
    setIsGenerating(true)
    setProgress(0)
    setReviewResult(null)
    setConsistencyResult(null)
    
    const params: Record<string, unknown> = {
      chapter_id: chapter.id,
      chapter_number: chapter.chapter_number,
      target_length: values.target_length || 3000,
      model: values.model || 'deepseek-chat',
      style: values.style || 'narrative',
    }

    if (values.user_prompt) {
      params.user_prompt = values.user_prompt
    }
    if (values.chapter_outline) {
      params.chapter_outline = values.chapter_outline
    }
    if (values.key_events) {
      params.key_events = values.key_events.split('\n').filter(e => e.trim())
    }
    if (values.focus_characters) {
      params.focus_characters = values.focus_characters.split('\n').filter(c => c.trim())
    }

    if (isConnected) {
      try {
        wsGenerationService.startGeneration('chapter', params, values.use_langgraph !== false)
      } catch (error) {
        message.error(getErrorMessage(error))
        setIsGenerating(false)
      }
    } else {
      message.warning('WebSocket未连接，请刷新页面重试')
      setIsGenerating(false)
    }
  }

  const onCancel = () => {
    if (taskId) {
      wsGenerationService.cancelGeneration(taskId)
    }
  }

  const onSaveContent = async () => {
    if (!id || !generatedContent) return
    
    setLoading(true)
    try {
      const response = await chapterApi.updateChapter(parseInt(id), {
        content: generatedContent,
      })
      if (response.success) {
        message.success('内容保存成功')
        navigate(`/chapters/${id}`)
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  if (fetchLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Spin size="large" />
        </div>
      </Card>
    )
  }

  if (!chapter) {
    return null
  }

  return (
    <Card title={`AI生成章节 - 第${chapter.chapter_number}章 ${chapter.title}`}>
      <Alert
        title="实时生成功能"
        description="使用WebSocket实时生成章节内容。启用LangGraph后会自动进行审核和一致性检查。可选择模型和风格，并提供自定义提示词。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <div style={{ marginBottom: 16 }}>
        <Text type={isConnected ? 'success' : 'danger'}>
          WebSocket状态: {isConnected ? '已连接' : '未连接'}
        </Text>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={onGenerate}
        initialValues={{
          target_length: 3000,
          model: 'deepseek-chat',
          style: 'narrative',
          use_langgraph: true,
        }}
      >
        <Form.Item label="LLM模型" name="model">
          <Select placeholder="选择模型">
            {models.map(m => (
              <Option key={m.value} value={m.value}>
                {m.label}
                <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  {m.description}
                </Text>
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item label="目标字数" name="target_length">
          <Select>
            <Option value={2000}>2000字</Option>
            <Option value={3000}>3000字</Option>
            <Option value={5000}>5000字</Option>
          </Select>
        </Form.Item>

        <Form.Item label="写作风格" name="style">
          <Select placeholder="选择写作风格">
            {styles.map(s => (
              <Option key={s.value} value={s.value}>
                {s.label}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item label="启用LangGraph审核" name="use_langgraph" valuePropName="checked">
          <Select>
            <Option value={true}>是（推荐）</Option>
            <Option value={false}>否</Option>
          </Select>
        </Form.Item>

        <Collapse ghost style={{ marginBottom: 16 }}>
          <Panel header="高级选项（自定义提示词）" key="advanced">
            <Form.Item label="自定义创作要求" name="user_prompt" extra="描述你对本章的特殊创作要求">
              <TextArea rows={3} placeholder="例如：本章要描写主角与反派的第一次对决，要有紧张感..." />
            </Form.Item>

            <Form.Item label="章节大纲" name="chapter_outline" extra="按行输入每个情节节点">
              <TextArea rows={4} placeholder="1. 开场：主角进入竞技场&#10;2. 发展：双方试探&#10;3. 高潮：主角使用新技能&#10;4. 结尾：反派撤退" />
            </Form.Item>

            <Form.Item label="关键事件" name="key_events" extra="每行一个关键事件">
              <TextArea rows={3} placeholder="主角展示新能力&#10;反派露出破绽" />
            </Form.Item>

            <Form.Item label="重点角色" name="focus_characters" extra="每行一个角色名">
              <TextArea rows={2} placeholder="主角名&#10;反派名" />
            </Form.Item>
          </Panel>
        </Collapse>

        <Form.Item>
          {isGenerating ? (
            <Button danger onClick={onCancel} size="large">
              取消生成
            </Button>
          ) : (
            <Button type="primary" htmlType="submit" disabled={!isConnected} size="large">
              开始生成
            </Button>
          )}
          <Button style={{ marginLeft: 8 }} onClick={() => navigate(`/chapters/${id}`)}>
            返回
          </Button>
        </Form.Item>
      </Form>

      {isGenerating && (
        <>
          <Divider>生成进度</Divider>
          <Card>
            <Progress percent={progress} status="active" />
            <Text type="secondary">{statusMessage}</Text>
          </Card>
        </>
      )}

      {reviewResult && (
        <>
          <Divider>审核结果</Divider>
          <Card>
            <Space>
              {reviewResult.approved ? (
                <Tag icon={<CheckCircleOutlined />} color="success">审核通过</Tag>
              ) : (
                <Tag icon={<CloseCircleOutlined />} color="error">审核未通过</Tag>
              )}
              <Text>评分: {reviewResult.score}/10</Text>
            </Space>
            {reviewResult.issues.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <Text type="warning">问题:</Text>
                <ul>
                  {reviewResult.issues.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </>
      )}

      {consistencyResult && (
        <>
          <Divider>一致性检查</Divider>
          <Card>
            {consistencyResult.passed ? (
              <Tag icon={<CheckCircleOutlined />} color="success">一致性检查通过</Tag>
            ) : (
              <>
                <Tag icon={<WarningOutlined />} color="warning">发现问题</Tag>
                <div style={{ marginTop: 8 }}>
                  <ul>
                    {consistencyResult.issues.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {generatedContent && (
        <>
          <Divider>生成结果</Divider>
          <Card>
            <div style={{ marginBottom: 8 }}>
              <Text>字数: {wordCount}</Text>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', maxHeight: '500px', overflow: 'auto' }}>
              {generatedContent}
            </div>
            <Divider />
            <Button type="primary" onClick={onSaveContent} loading={loading} disabled={isGenerating}>
              保存内容
            </Button>
          </Card>
        </>
      )}
    </Card>
  )
}

export default ChapterGenerate
