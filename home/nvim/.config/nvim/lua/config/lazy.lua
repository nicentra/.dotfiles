-- lazy.nvim, cloned on first start. Plugin specs live in lua/plugins/.
local path = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.uv.fs_stat(path) then
  local out = vim.fn.system({ "git", "clone", "--filter=blob:none", "--branch=stable", "https://github.com/folke/lazy.nvim.git", path })
  if vim.v.shell_error ~= 0 then
    vim.api.nvim_echo({ { "Cloning lazy.nvim failed:\n" .. out, "ErrorMsg" } }, true, {})
    return
  end
end
vim.opt.rtp:prepend(path)

require("lazy").setup({
  spec = { { import = "plugins" } },
  -- The lockfile goes next to the plugins, not into this repo: lazy rewrites
  -- it on every update, and ~/.config/nvim is linked into the repo.
  lockfile = vim.fn.stdpath("data") .. "/lazy-lock.json",
  install = { colorscheme = { "catppuccin" } },
  checker = { enabled = false },
  change_detection = { notify = false },
  rocks = { enabled = false }, -- no plugin here needs luarocks
})
