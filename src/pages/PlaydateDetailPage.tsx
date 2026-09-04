import { useParams } from 'react-router'
import { PlaceholderPage } from '../components/PlaceholderPage'

export function PlaydateDetailPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <PlaceholderPage
      title="Drop-in details"
      note={`Details for drop-in “${id ?? 'unknown'}” land in slice 4.`}
    />
  )
}