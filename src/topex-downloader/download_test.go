package topexdownloader

import (
	"testing"
)

func TestFetch(t *testing.T) {
	area := [...]Payload{
		{
			North: -10.1,
			South: -10.2,
			West:  360,
			East:  360.5,
			Mag:   0.1,
		},
		{
			North: -10.1,
			South: -10.2,
			West:  360,
			East:  360.5,
			Mag:   1,
		},
		{
			North: -10.2,
			South: -10.1,
			West:  360,
			East:  360.5,
			Mag:   1,
		},
		{
			North: -10.1,
			South: -10.2,
			West:  360.5,
			East:  360,
			Mag:   1,
		},
		{
			North: -10.1,
			South: -10.2,
			West:  360,
			East:  360.5,
			Mag:   2,
		},
	}

	expectedErr := []error{nil, nil, ErrSLE, ErrWLE, ErrInvalidMag}

	lenTest := len(area)

	for i := 0; i < lenTest; i++ {
		_, err := Fetch(area[i])
		if err != expectedErr[i] {
			t.Fatal("not expected")
		}
	}
}
