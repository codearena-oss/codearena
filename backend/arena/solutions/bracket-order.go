func bracketOrder(n int) []int {
	order := []int{1, 2}
	for len(order) < n {
		size := len(order) * 2
		var next []int
		for _, s := range order {
			next = append(next, s, size+1-s)
		}
		order = next
	}
	return order
}