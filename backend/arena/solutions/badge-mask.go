func badgeMask(earned []int) int {
	mask := 0
	for _, e := range earned {
		mask |= (1 << e)
	}
	return mask
}