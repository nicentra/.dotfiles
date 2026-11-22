-- The settings from ~/.vimrc, plus a few neovim defaults worth changing.
local o = vim.opt

o.splitright = true
o.splitbelow = true
o.tabstop = 4
o.softtabstop = 4
o.shiftwidth = 4
o.number = true
o.relativenumber = true
o.showmatch = true
o.incsearch = true
o.hlsearch = true
o.grepprg = "grep -nH $*"
-- Not ported: autochdir. It changes the directory per buffer, which breaks
-- the file finder and git signs; :lcd %:h does it for one window instead.

o.termguicolors = true
o.signcolumn = "yes" -- git signs don't shift the text
o.mouse = "a"
o.undofile = true -- undo history survives closing the file
o.ignorecase = true
o.smartcase = true
o.scrolloff = 5
o.updatetime = 250

vim.g.tex_flavor = "latex"
