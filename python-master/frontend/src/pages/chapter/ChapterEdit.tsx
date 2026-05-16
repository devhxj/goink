import { useEffect, useState } from 'react'
import { Card, Form, Input, Button, Select, message, Spin } from 'antd'
import { useParams, useNavigate } from 'react-router-dom'
import { chapterApi } from '@/services/chapterService'
import { getErrorMessage } from '@/types/error'
import type { ChapterDetail, ChapterStatus } from '@/types/chapter'

const { TextArea } = Input
const { Option } = Select

interface FormValues {
  title: string
  content: string
  status: ChapterStatus
  summary: string
}

function ChapterEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [chapter, setChapter] = useState<ChapterDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<FormValues>()

  useEffect(() => {
    if (id) {
      loadChapter(parseInt(id))
    }
  }, [id])

  const loadChapter = async (chapterId: number) => {
    setLoading(true)
    try {
      const response = await chapterApi.getChapter(chapterId)
      if (response.success) {
        setChapter(response.data)
        form.setFieldsValue({
          title: response.data.title,
          content: response.data.content || '',
          status: response.data.status,
          summary: response.data.summary || '',
        })
      }
    } catch (error) {
      message.error(getErrorMessage(error))
      navigate('/novels')
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (values: FormValues) => {
    if (!id) return
    
    setSubmitting(true)
    try {
      const response = await chapterApi.updateChapter(parseInt(id), {
        title: values.title,
        content: values.content,
        status: values.status,
        summary: values.summary || undefined,
      })
      if (response.success) {
        message.success('章节更新成功')
        navigate(`/chapters/${id}`)
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Spin size="large" />
        </div>
      </Card>
    )
  }

  if (!chapter) return null

  return (
    <Card title={`编辑章节 - 第${chapter.chapter_number}章`}>
      <Form
        form={form}
        layout="vertical"
        onFinish={onSubmit}
      >
        <Form.Item
          label="章节标题"
          name="title"
          rules={[{ required: true, message: '请输入章节标题' }]}
        >
          <Input placeholder="请输入章节标题" />
        </Form.Item>

        <Form.Item label="状态" name="status">
          <Select>
            <Option value="draft">草稿</Option>
            <Option value="completed">已完成</Option>
          </Select>
        </Form.Item>

        <Form.Item label="摘要" name="summary">
          <TextArea rows={3} placeholder="请输入章节摘要（可选）" />
        </Form.Item>

        <Form.Item
          label="章节内容"
          name="content"
          rules={[{ required: true, message: '请输入章节内容' }]}
        >
          <TextArea rows={15} placeholder="请输入章节内容" />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting}>
            保存
          </Button>
          <Button style={{ marginLeft: 8 }} onClick={() => navigate(`/chapters/${id}`)}>
            取消
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )
}

export default ChapterEdit
