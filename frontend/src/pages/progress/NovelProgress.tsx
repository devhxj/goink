import { useState, useEffect } from 'react'
import { Card, Row, Col, Statistic, Progress, Empty, Spin, message, Tag } from 'antd'
import { useParams } from 'react-router-dom'
import { progressApi } from '@/services/progressService'
import type { PlotProgress } from '@/types/progress'

function NovelProgress() {
  const { novelId } = useParams<{ novelId: string }>()
  const [loading, setLoading] = useState(false)
  const [plotProgress, setPlotProgress] = useState<PlotProgress | null>(null)

  useEffect(() => {
    if (novelId) {
      loadData()
    }
  }, [novelId])

  const loadData = async () => {
    if (!novelId) return

    setLoading(true)
    try {
      const response = await progressApi.getPlotProgress(parseInt(novelId))
      if (response.success) {
        setPlotProgress(response.data)
      }
    } catch (error: any) {
      message.error(error.error?.message || '加载数据失败')
    } finally {
      setLoading(false)
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

  if (!plotProgress) {
    return (
      <Card>
        <Empty description="暂无进度数据" />
      </Card>
    )
  }

  return (
    <div>
      <Card title="情节线统计" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic title="总情节线" value={plotProgress.plot_lines.total} />
          </Col>
          <Col span={6}>
            <Statistic title="主线" value={plotProgress.plot_lines.main} valueStyle={{ color: '#1890ff' }} />
          </Col>
          <Col span={6}>
            <Statistic title="支线" value={plotProgress.plot_lines.sub} valueStyle={{ color: '#52c41a' }} />
          </Col>
          <Col span={6}>
            <Statistic title="角色线" value={plotProgress.plot_lines.character} valueStyle={{ color: '#faad14' }} />
          </Col>
        </Row>
      </Card>

      <Card title="情节节点进度" style={{ marginBottom: 16 }}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Statistic title="总节点" value={plotProgress.nodes.total} />
          </Col>
          <Col span={6}>
            <Statistic title="已完成" value={plotProgress.nodes.completed} valueStyle={{ color: '#52c41a' }} />
          </Col>
          <Col span={6}>
            <Statistic title="进行中" value={plotProgress.nodes.in_progress} valueStyle={{ color: '#1890ff' }} />
          </Col>
          <Col span={6}>
            <Statistic title="完成率" value={plotProgress.nodes.completion_rate} suffix="%" />
          </Col>
        </Row>

        <Progress
          percent={plotProgress.nodes.completion_rate}
          status={plotProgress.nodes.completion_rate === 100 ? 'success' : 'active'}
          style={{ marginBottom: 16 }}
        />

        <Row gutter={16}>
          <Col span={12}>
            <Statistic title="计划中" value={plotProgress.nodes.planned} />
          </Col>
        </Row>
      </Card>

      <Card title="情节线详情">
        {plotProgress.plot_lines_detail.length > 0 ? (
          plotProgress.plot_lines_detail.map((line) => (
            <Card key={line.id} size="small" style={{ marginBottom: 8 }}>
              <Row gutter={16} align="middle">
                <Col span={6}>
                  <div>
                    <Tag color={line.line_type === 'main' ? 'blue' : line.line_type === 'sub' ? 'green' : 'default'}>
                      {line.line_type === 'main' ? '主线' : line.line_type === 'sub' ? '支线' : '角色线'}
                    </Tag>
                    <span style={{ marginLeft: 8 }}>{line.name}</span>
                  </div>
                </Col>
                <Col span={12}>
                  <Progress percent={line.progress_percentage} size="small" />
                </Col>
                <Col span={6}>
                  <span>
                    {line.completed}/{line.total_nodes} 节点
                  </span>
                </Col>
              </Row>
            </Card>
          ))
        ) : (
          <Empty description="暂无情节线数据" />
        )}
      </Card>
    </div>
  )
}

export default NovelProgress
