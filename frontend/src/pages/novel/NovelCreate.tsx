import { useState } from 'react'
import { Form, Input, Select, Button, Card, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { novelApi } from '@/services/novelService'
import { useNovelStore } from '@/stores/novelStore'
import { getErrorMessage } from '@/types/error'
import type { NovelCreate } from '@/types/novel'

const { TextArea } = Input
const { Option } = Select

function NovelCreatePage() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { addNovel } = useNovelStore()
  const [form] = Form.useForm<NovelCreate>()

  const onFinish = async (values: NovelCreate) => {
    setLoading(true)
    try {
      const response = await novelApi.createNovel(values)
      if (response.success) {
        addNovel(response.data)
        message.success('小说创建成功')
        navigate('/novels')
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card title="创建小说">
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        style={{ maxWidth: 600 }}
      >
        <Form.Item
          label="标题"
          name="title"
          rules={[{ required: true, message: '请输入小说标题' }]}
        >
          <Input placeholder="请输入小说标题" />
        </Form.Item>

        <Form.Item
          label="类型"
          name="genre"
          rules={[{ required: true, message: '请选择小说类型' }]}
        >
          <Select placeholder="请选择小说类型">
            <Option value="玄幻">玄幻</Option>
            <Option value="武侠">武侠</Option>
            <Option value="都市">都市</Option>
            <Option value="科幻">科幻</Option>
            <Option value="言情">言情</Option>
            <Option value="历史">历史</Option>
          </Select>
        </Form.Item>

        <Form.Item
          label="简介"
          name="description"
          rules={[{ required: true, message: '请输入小说简介' }]}
        >
          <TextArea rows={4} placeholder="请输入小说简介" />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            创建
          </Button>
          <Button style={{ marginLeft: 8 }} onClick={() => navigate('/novels')}>
            取消
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )
}

export default NovelCreatePage
