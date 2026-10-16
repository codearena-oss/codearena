import (
	"container/heap"
)

type Item struct {
	r, c, charges, dist int
	index              int
}

type PriorityQueue []*Item

func (pq PriorityQueue) Len() int           { return len(pq) }
func (pq PriorityQueue) Less(i, j int) bool { return pq[i].dist < pq[j].dist }
func (pq PriorityQueue) Swap(i, j int) {
	pq[i], pq[j] = pq[j], pq[i]
	pq[i].index = i
	pq[j].index = j
}
func (pq *PriorityQueue) Push(x interface{}) {
	n := len(*pq)
	item := x.(*Item)
	item.index = n
	*pq = append(*pq, item)
}
func (pq *PriorityQueue) Pop() interface{} {
	old := *pq
	n := len(old)
	item := old[n-1]
	old[n-1] = nil
	item.index = -1
	*pq = old[0 : n-1]
	return item
}

func breachRun(grid []string, charges int) int {
	R := len(grid)
	if R == 0 {
		return -1
	}
	C := len(grid[0])
	
	dist := make([][][]int, R)
	for i := 0; i < R; i++ {
		dist[i] = make([][]int, C)
		for j := 0; j < C; j++ {
			dist[i][j] = make([]int, charges+1)
			for k := 0; k <= charges; k++ {
				dist[i][j][k] = 1e9
			}
		}
	}

	pq := &PriorityQueue{}
	heap.Init(pq)

	dist[0][0][charges] = 0
	heap.Push(pq, &Item{r: 0, c: 0, charges: charges, dist: 0})

	dirs := [][]int{{-1, 0}, {1, 0}, {0, -1}, {0, 1}}

	for pq.Len() > 0 {
		curr := heap.Pop(pq).(*Item)
		if curr.r == R-1 && curr.c == C-1 {
			return curr.dist
		}
		if curr.dist > dist[curr.r][curr.c][curr.charges] {
			continue
		}

		for _, d := range dirs {
			nr, nc := curr.r+d[0], curr.c+d[1]
			if nr >= 0 && nr < R && nc >= 0 && nc < C {
				cell := grid[nr][nc]
				rem := curr.charges
				if cell == '#' {
					if rem <= 0 {
						continue
					}
					rem--
				}
				
				nextDist := curr.dist + 1
				if nextDist < dist[nr][nc][rem] {
					dist[nr][nc][rem] = nextDist
					heap.Push(pq, &Item{r: nr, c: nc, charges: rem, dist: nextDist})
				}
			}
		}
	}

	return -1
}