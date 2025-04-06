# Release Checklist

## Pre-Release
- [ ] Update version number in `index.html`
- [ ] Update version number in `package.json`
- [ ] Test all features locally
- [ ] Check that all paths are relative (no hardcoded URLs)
- [ ] Verify dark mode functionality
- [ ] Test responsive design on multiple screen sizes
- [ ] Ensure all API integrations are working
- [ ] Check that local storage features work correctly

## Release
- [ ] Commit all changes to `main` branch
- [ ] Push changes to GitHub
- [ ] Monitor GitHub Actions deployment
- [ ] Wait for deployment to complete (usually 2-3 minutes)

## Post-Release Verification
- [ ] Visit https://jlandx.github.io/city_comp/
- [ ] Verify that styles are loading correctly
- [ ] Test city comparison functionality
- [ ] Check that sharing features work
- [ ] Verify that tabs are working
- [ ] Test dark mode toggle
- [ ] Test unit conversion
- [ ] Verify that Top Comps are tracking
- [ ] Check that My Comps are saving correctly

## If Issues Are Found
1. Check browser console for errors
2. Verify all file paths in the deployed version
3. Test locally with the GitHub Pages base URL
4. Make necessary fixes and re-deploy
5. Document any issues in GitHub Issues

## Notes
- The base URL is set to `/city_comp/` for GitHub Pages
- All asset paths should be relative
- The GitHub Actions workflow handles deployment automatically
- The `main` branch is the production branch 