import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // A mensagem exibida nunca revela detalhes técnicos. A instrumentação de
    // erros pode ser adicionada aqui quando houver destino aprovado para logs.
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="grid min-h-screen place-items-center bg-background px-6 text-center">
        <section role="alert" className="max-w-md">
          <h1 className="text-xl font-bold text-foreground">Não foi possível exibir esta página.</h1>
          <p className="mt-2 text-sm text-muted-foreground">Tente carregar novamente. Se o problema persistir, informe a equipe responsável.</p>
          <Button className="mt-5" onClick={() => this.setState({ hasError: false })}>Tentar novamente</Button>
        </section>
      </main>
    );
  }
}
