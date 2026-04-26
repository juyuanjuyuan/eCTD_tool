import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Result, Typography } from 'antd';

const { Paragraph, Text } = Typography;

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null, info: null });
    window.location.href = '/projects';
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Result
        status="error"
        title="页面渲染失败"
        subTitle="该错误已被错误边界捕获，避免应用整体白屏。请截图发回开发团队。"
        extra={[
          <Button type="primary" key="home" onClick={this.handleReset}>
            返回项目列表
          </Button>,
          <Button key="reload" onClick={() => window.location.reload()}>
            刷新页面
          </Button>,
        ]}
      >
        <div style={{ textAlign: 'left', maxHeight: 400, overflow: 'auto', background: '#fafafa', padding: 16, borderRadius: 4 }}>
          <Paragraph>
            <Text strong>错误信息：</Text>
            <Text code copyable>{this.state.error.message}</Text>
          </Paragraph>
          {this.state.error.stack && (
            <Paragraph>
              <Text strong>调用栈：</Text>
              <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {this.state.error.stack}
              </pre>
            </Paragraph>
          )}
          {this.state.info?.componentStack && (
            <Paragraph>
              <Text strong>组件栈：</Text>
              <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {this.state.info.componentStack}
              </pre>
            </Paragraph>
          )}
        </div>
      </Result>
    );
  }
}
