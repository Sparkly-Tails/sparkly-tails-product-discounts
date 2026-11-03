// The one Admin API query that reads orders for the metrics: the paid orders created since a time, 50 at a time, oldest
// first. It asks for amounts, product ids and discount titles only: no customer field.

export const ORDERS_QUERY = `query metricsOrders($query: String!, $after: String) {
  orders(first: 50, sortKey: CREATED_AT, reverse: false, query: $query, after: $after) {
    nodes {
      id
      createdAt
      currentSubtotalPriceSet { shopMoney { amount currencyCode } }
      lineItems(first: 100) {
        nodes {
          product { id }
          quantity
          originalUnitPriceSet { shopMoney { amount } }
          discountAllocations {
            allocatedAmountSet { shopMoney { amount } }
            discountApplication { __typename allocationMethod ... on AutomaticDiscountApplication { title } }
          }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`

export interface OrdersPage {
  nodes: unknown[]
  endCursor: string | null
  hasNextPage: boolean
}

interface PageInfo {
  hasNextPage?: boolean
  endCursor?: string | null
}

interface OrdersAnswer {
  orders?: { nodes?: unknown[]; pageInfo?: PageInfo }
}

type QueryShop = (args: { query: string; variables: Record<string, unknown>; shop: string }) => Promise<unknown>

export function readNodes({ data }: { data: OrdersAnswer }): unknown[] {
  return data.orders?.nodes ?? []
}

export function readPageInfo({ data }: { data: OrdersAnswer }): PageInfo {
  return data.orders?.pageInfo ?? {}
}

export function readEndCursor({ pageInfo }: { pageInfo: PageInfo }): string | null {
  return pageInfo.endCursor ?? null
}

export function hasNextPage({ pageInfo }: { pageInfo: PageInfo }): boolean {
  return pageInfo.hasNextPage === true
}

interface QueryTools {
  readNodes: typeof readNodes
  readPageInfo: typeof readPageInfo
  readEndCursor: typeof readEndCursor
  hasNextPage: typeof hasNextPage
}

export function buildPage({ data, tools }: { data: OrdersAnswer; tools: QueryTools }): OrdersPage {
  const pageInfo = tools.readPageInfo({ data })
  return { nodes: tools.readNodes({ data }), endCursor: tools.readEndCursor({ pageInfo }), hasNextPage: tools.hasNextPage({ pageInfo }) }
}

export const QUERY_TOOLS = { readNodes, readPageInfo, readEndCursor, hasNextPage, buildPage }

/** One page of orders; an answer that is not the shape expected counts as an empty last page. */
export async function queryOrders({ shop, sinceIso, afterCursor, queryShop, tools = QUERY_TOOLS }: { shop: string; sinceIso: string; afterCursor: string | null; queryShop: QueryShop; tools?: typeof QUERY_TOOLS }): Promise<OrdersPage> {
  const data = (await queryShop({ query: ORDERS_QUERY, shop, variables: { query: `financial_status:paid created_at:>='${sinceIso}'`, after: afterCursor } })) as OrdersAnswer
  return tools.buildPage({ data, tools })
}
