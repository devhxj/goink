import { useState, useEffect, useCallback } from 'react'
import { Card, Form, Input, Button, Select, message, Spin, Tabs, Divider, Row, Col, Statistic, Alert, Progress, Typography } from 'antd'
import { useParams, useNavigate } from 'react-router-dom'
import { wsGenerationService } from '@/services/wsGenerationService'
import { generationApi } from '@/services/generationService'
import type { WSMessage, GenerationType, GenerationStyle, LLMModel } from '@/services/wsGenerationService'
import type { ModelOption, StyleOption } from '@/services/generationService'
import { getErrorMessage } from '@/types/error'

const { TextArea } = Input
const { Option } = Select
const { Text } = Typography

interface GenerationState {
  isGenerating: boolean
  progress: number
  statusMessage: string
  content: string
  wordCount: number
  taskId: string | null
}

function TextGeneration() {
  const [fetchLoading, setFetchLoading] = useState(true)
  const [models, setModels] = useState<ModelOption[]>([])
  const [styles, setStyles] = useState<StyleOption[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [generationState, setGenerationState] = useState<Record<GenerationType, GenerationState>>({
    chapter: { isGenerating: false, progress: 0, statusMessage: '', content: '', wordCount: 0, taskId: null },
    dialogue: { isGenerating: false, progress: 0, statusMessage: '', content: '', wordCount: 0, taskId: null },
    description: { isGenerating: false, progress: 0, statusMessage: '', content: '', wordCount: 0, taskId: null },
    outline: { isGenerating: false, progress: 0, statusMessage: '', content: '', wordCount: 0, taskId: null },
    summary: { isGenerating: false, progress: 0, statusMessage: '', content: '', wordCount: 0, taskId: null },
    character_profile: { isGenerating: false, progress: 0, statusMessage: '', content: '', wordCount: 0, taskId: null },
    chat: { isGenerating: false, progress: 0, statusMessage: '', content: '', wordCount: 0, taskId: null },
  })
  const [dialogueForm] = Form.useForm()
  const [descriptionForm] = Form.useForm()
  const [outlineForm] = Form.useForm()
  const [summaryForm] = Form.useForm()
  const [characterForm] = Form.useForm()
  const { novelId } = useParams<{ novelId: string }>()
  const navigate = useNavigate()

  useEffect(() => {
    loadConfig()
    if (novelId) {
      connectWebSocket()
    }
    return () => {
      wsGenerationService.disconnect()
    }
  }, [novelId])

  const loadConfig = async () => {
    setFetchLoading(true)
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
      message.error(getErrorMessage(error))
    } finally {
      setFetchLoading(false)
    }
  }

  const connectWebSocket = async () => {
    if (!novelId) return
    try {
      await wsGenerationService.connect(parseInt(novelId))
      setIsConnected(true)
      wsGenerationService.onMessage(handleWSMessage)
    } catch (error) {
      console.error('WebSocket connection failed:', error)
      message.warning('实时生成连接失败，部分功能可能不可用')
    }
  }

  const handleWSMessage = useCallback((msg: WSMessage) => {
    if (!('task_id' in msg)) return
    
    setGenerationState(prev => {
      const newState = { ...prev }
      Object.keys(newState).forEach(key => {
        const genType = key as GenerationType
        if (prev[genType].taskId === (msg as { task_id: string }).task_id) {
          switch (msg.type) {
            case 'generation_started':
              newState[genType] = { ...prev[genType], isGenerating: true, progress: 0, statusMessage: '开始生成...', content: '' }
              break
            case 'generation_progress':
              newState[genType] = { ...prev[genType], progress: msg.progress, statusMessage: msg.message }
              break
            case 'content_chunk':
              newState[genType] = { ...prev[genType], content: prev[genType].content + msg.chunk, wordCount: msg.accumulated_length }
              break
            case 'generation_completed':
              newState[genType] = { ...prev[genType], isGenerating: false, progress: 100, statusMessage: '生成完成！', wordCount: msg.word_count, content: msg.content }
              message.success(`生成成功，共${msg.word_count}字`)
              break
            case 'generation_failed':
              newState[genType] = { ...prev[genType], isGenerating: false }
              message.error(`生成失败: ${msg.error}`)
              break
          }
        }
      })
      return newState
    })
  }, [])

  const startGeneration = (generationType: GenerationType, params: Record<string, unknown>) => {
    if (!isConnected) {
      message.warning('WebSocket未连接，请刷新页面重试')
      return
    }
    
    setGenerationState(prev => ({
      ...prev,
      [generationType]: { isGenerating: true, progress: 0, statusMessage: '开始生成...', content: '', wordCount: 0, taskId: null },
    }))
    
    try {
      wsGenerationService.startGeneration(generationType, params)
    } catch (error) {
      message.error(getErrorMessage(error))
      setGenerationState(prev => ({ ...prev, [generationType]: { ...prev[generationType], isGenerating: false } }))
    }
  }

  const cancelGeneration = (generationType: GenerationType) => {
    const taskId = generationState[generationType].taskId
    if (taskId) {
      wsGenerationService.cancelGeneration(taskId)
    }
  }

  const onGenerateDialogue = (values: { characters: string; context: string; model?: LLMModel; style?: GenerationStyle; user_prompt?: string }) => {
    startGeneration('dialogue', {
      characters: values.characters.split('\n').filter(c => c.trim()),
      context: values.context,
      model: values.model || 'deepseek-chat',
      style: values.style || 'natural',
      user_prompt: values.user_prompt,
    })
  }

  const onGenerateDescription = (values: { subject: string; model?: LLMModel; style?: GenerationStyle; user_prompt?: string }) => {
    startGeneration('description', {
      subject: values.subject,
      model: values.model || 'deepseek-chat',
      style: values.style || 'vivid',
      user_prompt: values.user_prompt,
    })
  }

  const onGenerateOutline = (values: { premise: string; genre: string; total_chapters?: number; model?: LLMModel; style?: GenerationStyle; user_prompt?: string }) => {
    startGeneration('outline', {
      premise: values.premise,
      genre: values.genre,
      total_chapters: values.total_chapters || 20,
      model: values.model || 'deepseek-chat',
      style: values.style || 'narrative',
      user_prompt: values.user_prompt,
    })
  }

  const onGenerateSummary = (values: { content: string; max_length?: number; model?: LLMModel }) => {
    startGeneration('summary', {
      content: values.content,
      max_length: values.max_length || 500,
      model: values.model || 'deepseek-chat',
    })
  }

  const onGenerateCharacterProfile = (values: { name: string; role: string; novel_context: string; model?: LLMModel; style?: GenerationStyle; user_prompt?: string }) => {
    startGeneration('character_profile', {
      name: values.name,
      role: values.role,
      novel_context: values.novel_context,
      model: values.model || 'deepseek-chat',
      style: values.style || 'narrative',
      user_prompt: values.user_prompt,
    })
  }

  const renderGenerationResult = (generationType: GenerationType) => {
    const state = generationState[generationType]
    if (!state.content && !state.isGenerating) return null

    return (
      <>
        <Divider>生成结果</Divider>
        {state.isGenerating && (
          <Card style={{ marginBottom: 16 }}>
            <Progress percent={state.progress} status="active" />
            <Text type="secondary">{state.statusMessage}</Text>
          </Card>
        )}
        {state.content && (
          <Card>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}>
                <Statistic title="字数" value={state.wordCount} />
              </Col>
              <Col span={8}>
                <Statistic title="进度" value={state.progress} suffix="%" />
              </Col>
            </Row>
            <Divider />
            <div style={{ whiteSpace: 'pre-wrap', maxHeight: '500px', overflow: 'auto' }}>
              {state.content}
            </div>
          </Card>
        )}
      </>
    )
  }

  const renderModelSelect = () => (
    <Form.Item label="LLM模型" name="model" initialValue="deepseek-chat">
      <Select placeholder="选择模型">
        {models.map(m => (
          <Option key={m.value} value={m.value}>
            {m.label}
          </Option>
        ))}
      </Select>
    </Form.Item>
  )

  const renderStyleSelect = (defaultStyle: GenerationStyle = 'narrative') => (
    <Form.Item label="写作风格" name="style" initialValue={defaultStyle}>
      <Select placeholder="选择写作风格">
        {styles.map(s => (
          <Option key={s.value} value={s.value}>
            {s.label}
          </Option>
        ))}
      </Select>
    </Form.Item>
  )

  const renderUserPrompt = () => (
    <Form.Item label="自定义要求" name="user_prompt">
      <TextArea rows={2} placeholder="可选：输入特殊创作要求..." />
    </Form.Item>
  )

  const tabItems = [
    {
      key: 'dialogue',
      label: '对话生成',
      children: (
        <>
          <Form form={dialogueForm} layout="vertical" onFinish={onGenerateDialogue}>
            {renderModelSelect()}
            <Form.Item label="参与角色" name="characters" rules={[{ required: true, message: '请输入参与角色' }]} extra="每行一个角色名">
              <TextArea rows={3} placeholder="角色A&#10;角色B&#10;角色C" />
            </Form.Item>
            <Form.Item label="对话场景" name="context" rules={[{ required: true, message: '请输入对话场景' }]}>
              <TextArea rows={3} placeholder="请描述对话发生的场景和背景..." />
            </Form.Item>
            {renderStyleSelect('natural')}
            {renderUserPrompt()}
            <Form.Item>
              {generationState.dialogue.isGenerating ? (
                <Button danger onClick={() => cancelGeneration('dialogue')}>取消生成</Button>
              ) : (
                <Button type="primary" htmlType="submit" disabled={!isConnected}>生成对话</Button>
              )}
            </Form.Item>
          </Form>
          {renderGenerationResult('dialogue')}
        </>
      ),
    },
    {
      key: 'description',
      label: '描写生成',
      children: (
        <>
          <Form form={descriptionForm} layout="vertical" onFinish={onGenerateDescription}>
            {renderModelSelect()}
            <Form.Item label="描写对象" name="subject" rules={[{ required: true, message: '请输入描写对象' }]}>
              <TextArea rows={3} placeholder="请输入要描写的内容..." />
            </Form.Item>
            {renderStyleSelect('vivid')}
            {renderUserPrompt()}
            <Form.Item>
              {generationState.description.isGenerating ? (
                <Button danger onClick={() => cancelGeneration('description')}>取消生成</Button>
              ) : (
                <Button type="primary" htmlType="submit" disabled={!isConnected}>生成描写</Button>
              )}
            </Form.Item>
          </Form>
          {renderGenerationResult('description')}
        </>
      ),
    },
    {
      key: 'outline',
      label: '大纲生成',
      children: (
        <>
          <Form form={outlineForm} layout="vertical" onFinish={onGenerateOutline}>
            {renderModelSelect()}
            <Form.Item label="故事前提" name="premise" rules={[{ required: true, message: '请输入故事前提' }]}>
              <TextArea rows={3} placeholder="请描述故事的核心前提..." />
            </Form.Item>
            <Form.Item label="类型" name="genre" rules={[{ required: true, message: '请输入类型' }]}>
              <Input placeholder="如：玄幻、都市、科幻..." />
            </Form.Item>
            <Form.Item label="总章节数" name="total_chapters">
              <Input type="number" placeholder="默认20章" />
            </Form.Item>
            {renderStyleSelect('narrative')}
            {renderUserPrompt()}
            <Form.Item>
              {generationState.outline.isGenerating ? (
                <Button danger onClick={() => cancelGeneration('outline')}>取消生成</Button>
              ) : (
                <Button type="primary" htmlType="submit" disabled={!isConnected}>生成大纲</Button>
              )}
            </Form.Item>
          </Form>
          {renderGenerationResult('outline')}
        </>
      ),
    },
    {
      key: 'summary',
      label: '摘要生成',
      children: (
        <>
          <Form form={summaryForm} layout="vertical" onFinish={onGenerateSummary}>
            {renderModelSelect()}
            <Form.Item label="原文内容" name="content" rules={[{ required: true, message: '请输入原文内容' }]}>
              <TextArea rows={6} placeholder="请输入需要生成摘要的原文..." />
            </Form.Item>
            <Form.Item label="最大长度" name="max_length">
              <Input type="number" placeholder="默认500字" />
            </Form.Item>
            <Form.Item>
              {generationState.summary.isGenerating ? (
                <Button danger onClick={() => cancelGeneration('summary')}>取消生成</Button>
              ) : (
                <Button type="primary" htmlType="submit" disabled={!isConnected}>生成摘要</Button>
              )}
            </Form.Item>
          </Form>
          {renderGenerationResult('summary')}
        </>
      ),
    },
    {
      key: 'character_profile',
      label: '角色档案',
      children: (
        <>
          <Form form={characterForm} layout="vertical" onFinish={onGenerateCharacterProfile}>
            {renderModelSelect()}
            <Form.Item label="角色名" name="name" rules={[{ required: true, message: '请输入角色名' }]}>
              <Input placeholder="请输入角色名称" />
            </Form.Item>
            <Form.Item label="角色定位" name="role" rules={[{ required: true, message: '请输入角色定位' }]}>
              <Input placeholder="如：主角、反派、配角..." />
            </Form.Item>
            <Form.Item label="小说背景" name="novel_context" rules={[{ required: true, message: '请输入小说背景' }]}>
              <TextArea rows={3} placeholder="请描述小说的世界观和背景..." />
            </Form.Item>
            {renderStyleSelect('narrative')}
            {renderUserPrompt()}
            <Form.Item>
              {generationState.character_profile.isGenerating ? (
                <Button danger onClick={() => cancelGeneration('character_profile')}>取消生成</Button>
              ) : (
                <Button type="primary" htmlType="submit" disabled={!isConnected}>生成角色档案</Button>
              )}
            </Form.Item>
          </Form>
          {renderGenerationResult('character_profile')}
        </>
      ),
    },
  ]

  if (fetchLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Spin size="large" />
        </div>
      </Card>
    )
  }

  return (
    <Card title="文本生成工具">
      <Alert
        title="实时生成功能"
        description="使用WebSocket实时生成内容，可以看到生成过程和进度。可选择不同的LLM模型和写作风格。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <div style={{ marginBottom: 16 }}>
        <Text type={isConnected ? 'success' : 'danger'}>
          WebSocket状态: {isConnected ? '已连接' : '未连接'}
        </Text>
      </div>

      <Tabs defaultActiveKey="dialogue" items={tabItems} />

      <div style={{ marginTop: 16 }}>
        <Button onClick={() => navigate(`/novels/${novelId}`)}>返回小说详情</Button>
      </div>
    </Card>
  )
}

export default TextGeneration
