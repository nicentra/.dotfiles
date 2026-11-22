-- Neovim: small on purpose. Quick edits, commit messages, config files and
-- ssh sessions; heavier editing happens elsewhere. Needs neovim 0.10+.
vim.g.mapleader = " "
vim.g.maplocalleader = " "

require("config.options")
require("config.keymaps")
require("config.lazy")
