import { ref, onMounted, onUnmounted, type Ref } from 'vue'
import { createRepo, type Row, type Repo } from '@/lib/db'

/** 通用集合：自动加载并订阅实时变更 */
export function useCollection(table: string) {
  const repo: Repo = createRepo(table)
  const items = ref<Row[]>([]) as Ref<Row[]>
  let unsub: () => void = () => {}

  async function reload() {
    items.value = await repo.list()
  }
  function start() {
    void reload()
    unsub = repo.subscribe(() => void reload())
  }
  function stop() {
    unsub()
  }

  onMounted(start)
  onUnmounted(stop)

  return { repo, items, reload, start, stop }
}
