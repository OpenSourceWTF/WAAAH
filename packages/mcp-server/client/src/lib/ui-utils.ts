
export const getStatusBadgeClass = (status: string) => {
  const base = "text-xs font-bold px-2 py-1 border border-black";
  switch (status) {
    case 'COMPLETED': return `${base} bg-green-600 text-white border-green-800`;
    case 'FAILED':
    case 'CANCELLED': return `${base} bg-red-600 text-white border-red-800`;
    case 'ASSIGNED':
    case 'IN_PROGRESS':
    case 'PROCESSING': return `${base} bg-blue-600 text-white border-blue-800`;
    case 'QUEUED':
    case 'PENDING_ACK':
    case 'WAITING': return `${base} bg-yellow-500 text-black border-yellow-700`;
    case 'BLOCKED':
    case 'PENDING':
    case 'PENDING_RES':
    case 'REVIEW':
    case 'IN_REVIEW': return `${base} bg-white text-black border-gray-400`;
    default: return `${base} bg-gray-600 text-white`;
  }
};
