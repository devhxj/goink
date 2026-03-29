import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu } from 'antd'
import { BookOutlined, UserOutlined, LogoutOutlined } from '@ant-design/icons'
import { useAuthStore } from '@/stores/authStore'
import styles from './MainLayout.module.css'

const { Header, Sider, Content } = Layout

function MainLayout() {
  const { user, logout, isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  const menuItems = [
    {
      key: '/novels',
      icon: <BookOutlined />,
      label: '小说管理',
    },
    {
      key: '/characters',
      icon: <UserOutlined />,
      label: '角色管理',
    },
  ]

  const getSelectedKey = () => {
    const path = location.pathname
    if (path.startsWith('/novels/')) {
      const parts = path.split('/')
      if (parts.length >= 3) {
        return `/novels/${parts[2]}`
      }
    }
    if (path.startsWith('/characters/')) {
      return '/characters'
    }
    return path
  }

  return (
    <Layout className={styles.layout}>
      <Sider width={200} className={styles.sider}>
        <div className={styles.logo}>
          <BookOutlined className={styles.logoIcon} />
          <span>AI小说生成系统</span>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[getSelectedKey()]}
          items={menuItems}
          className={styles.menu}
          onClick={({ key }) => {
            if (key.startsWith('/novels/') || key.startsWith('/characters')) {
              navigate(key)
            }
          }}
        />
      </Sider>
      <Layout>
        <Header className={styles.header}>
          <div className={styles.headerRight}>
            <span className={styles.username}>{user?.username}</span>
            <LogoutOutlined className={styles.logoutIcon} onClick={logout} />
          </div>
        </Header>
        <Content className={styles.content}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

export default MainLayout
