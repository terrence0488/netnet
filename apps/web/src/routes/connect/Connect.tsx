import { useParams, useSearchParams } from 'react-router';
import { ConnectFlow, parseEntry } from '../../components/ConnectFlow';

/**
 * The connect flow's routes (`/agent/connect`, `/agent/connect/:client`): the flow with the entry
 * the query names and the agent the path does, if any. The flow itself is one component shared by
 * every entry (PRD J5), so the routes can never drift apart.
 */
export function Connect() {
  const { client } = useParams();
  const [params] = useSearchParams();
  return <ConnectFlow entry={parseEntry(params.get('entry'))} client={client ?? null} />;
}
