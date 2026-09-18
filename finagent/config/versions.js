// FinAgent 版本配置：lite（简版）/ full（完整版）
module.exports = {
  lite: {
    name: 'lite',
    label: '简版',
    // 简版：数据量少、算法简单、有分析、无预测
    collect: {
      tickers: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'JPM', 'BABA'],
      lookbackDays: 365,
      interval: '1d',
      maxBars: 400,
      fields: ['open', 'high', 'low', 'close', 'volume'],
      sources: ['yfinance'],
      includeFundamentals: false,
    },
    analyze: {
      enabled: true,
      // 简单指标
      indicators: ['sma20', 'sma60', 'rsi', 'atr'],
    },
    predict: {
      enabled: false,
    },
  },
  full: {
    name: 'full',
    label: '完整版',
    // 完整版：数据量大、分析更精准、预测开放、命中率可检测
    collect: {
      tickers: [
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM',
        'BABA', '0700.HK', '7203.T', '700600.KS', '^GSPC', '^IXIC', '^DJI',
        'BTC-USD', 'ETH-USD', 'EURUSD=X', 'GC=F', 'CL=F',
      ],
      lookbackDays: 3650, // 10 年
      interval: '1d',
      maxBars: 2500,
      fields: ['open', 'high', 'low', 'close', 'volume', 'adjclose', 'shares'],
      sources: ['yfinance', 'alpha_vantage'],
      includeFundamentals: true,
      includeNews: true,
      includeMacro: true,
    },
    analyze: {
      enabled: true,
      indicators: ['sma20', 'sma50', 'sma200', 'ema12', 'ema26', 'rsi', 'macd', 'atr', 'boll', 'vol'],
    },
    predict: {
      enabled: true,
      horizons: [5, 20, 60],
      model: 'linear+regression+momentum',
      backtest: {
        enabled: true,
        windowDays: 252,
        threshold: 0.02,
      },
      accuracyReport: {
        enabled: true,
      },
    },
  },
};
