// FinAgent version config: lite (simple) / full (complete, high-precision, predictive).
module.exports = {
  lite: {
    name: 'lite',
    label: 'lite',
    collect: {
      tickers: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'JPM', 'BABA'],
      lookbackDays: 365,
      interval: '1d',
      maxBars: 400,
      fields: ['open', 'high', 'low', 'close', 'volume'],
      sources: ['yfinance', 'alpha_vantage'],
      includeFundamentals: false,
    },
    analyze: {
      enabled: true,
      indicators: ['sma20', 'sma60', 'rsi', 'atr'],
    },
    predict: {
      enabled: false,
    },
  },
  full: {
    name: 'full',
    label: 'full',
    collect: {
      tickers: [
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM',
        'BABA', '0700.HK', '7203.T', '700600.KS', '^GSPC', '^IXIC', '^DJI',
        'BTC-USD', 'ETH-USD', 'EURUSD=X', 'GC=F', 'CL=F',
      ],
      lookbackDays: 3650,
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
      model: 'inhouse-T4-advanced',
      backtest: {
        enabled: true,
        windowDays: 252,
        threshold: 0.02,
        historicalDryRun: true,
      },
      accuracyReport: {
        enabled: true,
      },
    },
  },
};
