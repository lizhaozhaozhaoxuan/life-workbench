import {
  Chart,
  LineController,
  BarController,
  DoughnutController,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

Chart.register(
  LineController,
  BarController,
  DoughnutController,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
)

Chart.defaults.font.family =
  'system-ui, -apple-system, PingFang SC, Microsoft YaHei, sans-serif'
Chart.defaults.color = 'rgba(148,163,184,0.9)'

export default Chart
