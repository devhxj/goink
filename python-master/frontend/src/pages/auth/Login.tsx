import { useState } from 'react'
import { Form, Input, Button, Card, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '@/services/authService'
import { useAuthStore } from '@/stores/authStore'
import { getErrorMessage } from '@/types/error'
import styles from './Auth.module.css'

interface LoginFormValues {
  username: string
  password: string
}

function Login() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { setTokens, setUser } = useAuthStore()
  const [form] = Form.useForm<LoginFormValues>()

  const onFinish = async (values: LoginFormValues) => {
    setLoading(true)
    try {
      const response = await authApi.login(values)
      if (response.success) {
        setTokens(response.data.access_token, response.data.refresh_token)
        const userResponse = await authApi.getCurrentUser()
        if (userResponse.success) {
          setUser(userResponse.data)
        }
        message.success('登录成功')
        navigate('/')
      }
    } catch (error) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <Card className={styles.card} title="AI小说生成系统 - 登录">
        <Form
          form={form}
          name="login"
          onFinish={onFinish}
          autoComplete="off"
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>

          <div className={styles.footer}>
            还没有账号？ <Link to="/register">立即注册</Link>
          </div>
        </Form>
      </Card>
    </div>
  )
}

export default Login
