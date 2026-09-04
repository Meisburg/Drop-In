import { useParams } from 'react-router'
import { PlaceholderPage } from '../components/PlaceholderPage'

export function UserPage() {
  const { handle } = useParams<{ handle: string }>()
  return (
    <PlaceholderPage
      title={`@${handle ?? 'unknown'}`}
      note="Public profile view lands in slice 2."
    />
  )
}