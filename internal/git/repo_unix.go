//go:build !windows

package git

import "os/exec"

func setPlatformAttr(*exec.Cmd) {}
