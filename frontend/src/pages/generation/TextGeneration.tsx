import { useState, useEffect } from 'react'
import { Card, Form, Input, Button, Select, message, Spin, Tabs, Divider, Row, Col, Statistic } from 'antd'
import { useParams, useNavigate } from 'react-router-dom'
import { textGenerationApi } from '@/services/textGenerationService'
import { getErrorMessage } from '@/types/error'
import type { GenerationTypesResponse, TextGenerationResult, GenerationStyle, GenerationType } from '@/types/textGeneration'

const { TextArea } = Input
const { Option } = Select
const { TabPane } = Tabs

interface ChapterFormValues {
  chapter_number: number
  target_length?: number
  style?: GenerationStyle
}

interface DialogueFormValues {
  characters: string
  context: string
  style?: GenerationStyle
}

interface DescriptionFormValues {
  subject: string
  style?: GenerationStyle
}

interface OutlineFormValues {
  premise: string
  genre: string
  total_chapters?: number
  style?: GenerationStyle
}

interface SummaryFormValues {
  content: string
  max_length?: number
}

interface CharacterFormValues {
  name: string
  role: string
  novel_context: string
  style?: GenerationStyle
}

interface CustomFormValues {
  prompt: string
  generation_type?: GenerationType
  style?: GenerationStyle
  target_length?: number
  temperature?: number
}

function TextGeneration() {
  const [loading, setLoading] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [typesData, setTypesData] = useState<GenerationTypesResponse | null>(null)
  const [result, setResult] = useState<TextGenerationResult | null>(null)
  const [chapterForm] = Form.useForm<ChapterFormValues>()
  const [dialogueForm] = Form.useForm<DialogueFormValues>()
  const [descriptionForm] = Form.useForm<DescriptionFormValues>()
  const [outlineForm] = Form.useForm<OutlineFormValues>()
  const [summaryForm] = Form.useForm<SummaryFormValues>()
  const [characterForm] = Form.useForm<CharacterFormValues>()
  const [customForm] = Form.useForm<CustomFormValues>()
  const { novelId } = useParams<{ novelId: string }>()
  const navigate = useNavigate()

  useEffect(() => {
    loadTypes()
  }, [])

  const loadTypes = async () => {
    setFetchLoading(true)
    try {
      const response = await textGenerationApi.getGenerationTypes()
      if (response.success) {
        setTypesData(response.data)
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setFetchLoading(false)
    }
  }

  const onGenerateChapter = async (values: ChapterFormValues) => {
    if (!novelId) return
    setLoading(true)
    try {
      const response = await textGenerationApi.generateChapter(parseInt(novelId), {
        chapter_number: values.chapter_number,
        target_length: values.target_length || 3000,
        style: values.style || 'narrative',
      })
      if (response.success) {
        setResult(response.data)
        message.success('章节生成成功')
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const onGenerateDialogue = async (values: DialogueFormValues) => {
    if (!novelId) return
    setLoading(true)
    try {
      const response = await textGenerationApi.generateDialogue(parseInt(novelId), {
        characters: values.characters.split('\n').filter((c) => c.trim()),
        context: values.context,
        style: values.style || 'natural',
      })
      if (response.success) {
        setResult(response.data)
        message.success('对话生成成功')
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const onGenerateDescription = async (values: DescriptionFormValues) => {
    if (!novelId) return
    setLoading(true)
    try {
      const response = await textGenerationApi.generateDescription(parseInt(novelId), {
        subject: values.subject,
        style: values.style || 'vivid',
      })
      if (response.success) {
        setResult(response.data)
        message.success('描写生成成功')
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const onGenerateOutline = async (values: OutlineFormValues) => {
    if (!novelId) return
    setLoading(true)
    try {
      const response = await textGenerationApi.generateOutline(parseInt(novelId), {
        premise: values.premise,
        genre: values.genre,
        total_chapters: values.total_chapters || 20,
        style: values.style || 'narrative',
      })
      if (response.success) {
        setResult(response.data)
        message.success('大纲生成成功')
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const onGenerateSummary = async (values: SummaryFormValues) => {
    if (!novelId) return
    setLoading(true)
    try {
      const response = await textGenerationApi.generateSummary(parseInt(novelId), {
        content: values.content,
        max_length: values.max_length || 500,
      })
      if (response.success) {
        setResult(response.data)
        message.success('摘要生成成功')
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const onGenerateCharacterProfile = async (values: CharacterFormValues) => {
    if (!novelId) return
    setLoading(true)
    try {
      const response = await textGenerationApi.generateCharacterProfile(parseInt(novelId), {
        name: values.name,
        role: values.role,
        novel_context: values.novel_context,
        style: values.style || 'narrative',
      })
      if (response.success) {
        setResult(response.data)
        message.success('角色档案生成成功')
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const onGenerateCustom = async (values: CustomFormValues) => {
    if (!novelId) return
    setLoading(true)
    try {
      const response = await textGenerationApi.generateCustom(parseInt(novelId), {
        prompt: values.prompt,
        generation_type: values.generation_type || 'chapter',
        style: values.style || 'narrative',
        target_length: values.target_length || 3000,
        temperature: values.temperature || 0.8,
      })
      if (response.success) {
        setResult(response.data)
        message.success('自定义生成成功')
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

  return (
    <Card title="文本生成工具">
      <Tabs defaultActiveKey="chapter">
        <TabPane tab="章节生成" key="chapter">
          <Form form={chapterForm} layout="vertical" onFinish={onGenerateChapter}>
            <Form.Item label="章节号" name="chapter_number" rules={[{ required: true, message: '请输入章节号' }]}>
              <Input type="number" placeholder="请输入章节号" />
            </Form.Item>
            <Form.Item label="目标字数" name="target_length">
              <Input type="number" placeholder="默认3000字" />
            </Form.Item>
            <Form.Item label="写作风格" name="style">
              <Select placeholder="请选择写作风格">
                {typesData?.styles.map((s) => (
                  <Option key={s.value} value={s.value}>
                    {s.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading}>
                生成章节
              </Button>
            </Form.Item>
          </Form>
        </TabPane>

        <TabPane tab="对话生成" key="dialogue">
          <Form form={dialogueForm} layout="vertical" onFinish={onGenerateDialogue}>
            <Form.Item label="参与角色" name="characters" rules={[{ required: true, message: '请输入参与角色' }]} extra="每行一个角色名">
              <TextArea rows={3} placeholder="角色A&#10;角色B&#10;角色C" />
            </Form.Item>
            <Form.Item label="对话场景" name="context" rules={[{ required: true, message: '请输入对话场景' }]}>
              <TextArea rows={3} placeholder="请描述对话发生的场景和背景..." />
            </Form.Item>
            <Form.Item label="对话风格" name="style">
              <Select placeholder="请选择对话风格">
                {typesData?.styles.map((s) => (
                  <Option key={s.value} value={s.value}>
                    {s.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading}>
                生成对话
              </Button>
            </Form.Item>
          </Form>
        </TabPane>

        <TabPane tab="描写生成" key="description">
          <Form form={descriptionForm} layout="vertical" onFinish={onGenerateDescription}>
            <Form.Item label="描写对象" name="subject" rules={[{ required: true, message: '请输入描写对象' }]}>
              <TextArea rows={3} placeholder="请输入要描写的内容，如场景、人物外貌、物品等..." />
            </Form.Item>
            <Form.Item label="描写风格" name="style">
              <Select placeholder="请选择描写风格">
                {typesData?.styles.map((s) => (
                  <Option key={s.value} value={s.value}>
                    {s.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading}>
                生成描写
              </Button>
            </Form.Item>
          </Form>
        </TabPane>

        <TabPane tab="大纲生成" key="outline">
          <Form form={outlineForm} layout="vertical" onFinish={onGenerateOutline}>
            <Form.Item label="故事前提" name="premise" rules={[{ required: true, message: '请输入故事前提' }]}>
              <TextArea rows={3} placeholder="请描述故事的核心前提..." />
            </Form.Item>
            <Form.Item label="类型" name="genre" rules={[{ required: true, message: '请输入类型' }]}>
              <Input placeholder="如：玄幻、都市、科幻..." />
            </Form.Item>
            <Form.Item label="总章节数" name="total_chapters">
              <Input type="number" placeholder="默认20章" />
            </Form.Item>
            <Form.Item label="写作风格" name="style">
              <Select placeholder="请选择写作风格">
                {typesData?.styles.map((s) => (
                  <Option key={s.value} value={s.value}>
                    {s.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading}>
                生成大纲
              </Button>
            </Form.Item>
          </Form>
        </TabPane>

        <TabPane tab="摘要生成" key="summary">
          <Form form={summaryForm} layout="vertical" onFinish={onGenerateSummary}>
            <Form.Item label="原文内容" name="content" rules={[{ required: true, message: '请输入原文内容' }]}>
              <TextArea rows={6} placeholder="请输入需要生成摘要的原文..." />
            </Form.Item>
            <Form.Item label="最大长度" name="max_length">
              <Input type="number" placeholder="默认500字" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading}>
                生成摘要
              </Button>
            </Form.Item>
          </Form>
        </TabPane>

        <TabPane tab="角色档案" key="character_profile">
          <Form form={characterForm} layout="vertical" onFinish={onGenerateCharacterProfile}>
            <Form.Item label="角色名" name="name" rules={[{ required: true, message: '请输入角色名' }]}>
              <Input placeholder="请输入角色名称" />
            </Form.Item>
            <Form.Item label="角色定位" name="role" rules={[{ required: true, message: '请输入角色定位' }]}>
              <Input placeholder="如：主角、反派、配角..." />
            </Form.Item>
            <Form.Item label="小说背景" name="novel_context" rules={[{ required: true, message: '请输入小说背景' }]}>
              <TextArea rows={3} placeholder="请描述小说的世界观和背景..." />
            </Form.Item>
            <Form.Item label="写作风格" name="style">
              <Select placeholder="请选择写作风格">
                {typesData?.styles.map((s) => (
                  <Option key={s.value} value={s.value}>
                    {s.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading}>
                生成角色档案
              </Button>
            </Form.Item>
          </Form>
        </TabPane>

        <TabPane tab="自定义生成" key="custom">
          <Form form={customForm} layout="vertical" onFinish={onGenerateCustom}>
            <Form.Item label="生成类型" name="generation_type">
              <Select placeholder="请选择生成类型">
                {typesData?.types.map((t) => (
                  <Option key={t.value} value={t.value}>
                    {t.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="自定义提示词" name="prompt" rules={[{ required: true, message: '请输入自定义提示词' }]}>
              <TextArea rows={4} placeholder="请输入自定义生成提示词..." />
            </Form.Item>
            <Form.Item label="写作风格" name="style">
              <Select placeholder="请选择写作风格">
                {typesData?.styles.map((s) => (
                  <Option key={s.value} value={s.value}>
                    {s.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="目标字数" name="target_length">
              <Input type="number" placeholder="默认3000字" />
            </Form.Item>
            <Form.Item label="创造性程度" name="temperature">
              <Select placeholder="请选择创造性程度">
                <Option value={0.5}>0.5 - 保守</Option>
                <Option value={0.8}>0.8 - 平衡</Option>
                <Option value={1.0}>1.0 - 创意</Option>
              </Select>
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading}>
                自定义生成
              </Button>
            </Form.Item>
          </Form>
        </TabPane>
      </Tabs>

      {result && (
        <>
          <Divider>生成结果</Divider>
          <Card>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}>
                <Statistic title="字数" value={result.word_count} />
              </Col>
              <Col span={8}>
                <Statistic title="生成时间" value={result.generation_time.toFixed(2)} suffix="秒" />
              </Col>
              <Col span={8}>
                <Statistic title="使用模型" value={result.model_used} />
              </Col>
            </Row>
            <Divider />
            <div style={{ whiteSpace: 'pre-wrap', maxHeight: '500px', overflow: 'auto' }}>
              {result.content}
            </div>
          </Card>
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <Button onClick={() => navigate(`/novels/${novelId}`)}>返回小说详情</Button>
      </div>
    </Card>
  )
}

export default TextGeneration
