#! groovy
library 'pipeline-library'

def nodeVersion = '8.9.1'
def npmVersion = 'latest'
def sdkVersion = '7.5.0.GA'
def androidAPILevel = '25'
def androidBuildToolsVersion = '25.0.3'

timestamps {
  node {
    stage("Checkout") {
      checkout([
        $class: 'GitSCM',
        branches: scm.branches,
        extensions: scm.extensions + [[$class: 'CleanBeforeCheckout']],
        userRemoteConfigs: scm.userRemoteConfigs
      ])
      stash 'sources'
    }
  }
  stage("Build & Test") {
    parallel([
      Android: {
        node('android-sdk && android-ndk && osx') {
          unstash 'sources'
          nodejs(nodeJSInstallationName: "node ${nodeVersion}") {
            ensureNPM(npmVersion)
            sh 'npm ci'

            // We have to hack to make sure we pick up correct ANDROID_SDK/NDK values from the node that's currently running this section of the build.
            def androidSDK = env.ANDROID_SDK // default to what's in env (may have come from jenkins env vars set on initial node)
            def androidNDK = env.ANDROID_NDK_R12B
            withEnv(['ANDROID_SDK=', "ANDROID_NDK_R12B="]) {
              try {
                androidSDK = sh(returnStdout: true, script: 'printenv ANDROID_SDK').trim()
              } catch (e) {
                // squash, env var not set at OS-level
              }
              try {
                androidNDK = sh(returnStdout: true, script: "printenv ANDROID_NDK_R12B").trim()
              } catch (e) {
                // squash, env var not set at OS-level
              }

              dir('android') {
                sh 'rm -rf build/ dist/ libs/'
              }

              sh "ti config android.sdkPath ${androidSDK}"
              sh "ti config android.ndkPath ${androidNDK}"
              sh "ti config android.buildTools.selectedVersion ${androidBuildToolsVersion}"

              sh 'npm run test:android'

              dir('android') {
                dir('dist') {
                  archiveArtifacts '*.zip'
                }
              }
            }
          }
          deleteDir()
        }
      },
      iOS: {
        node('osx && xcode') {
          unstash 'sources'
          nodejs(nodeJSInstallationName: "node ${nodeVersion}") {
            ensureNPM(npmVersion)
            sh 'npm ci'

            dir('ios') {
              sh "sed -i \".bak\" \"s/^TITANIUM_SDK_VERSION.*/TITANIUM_SDK_VERSION=${sdkVersion}/\" titanium.xcconfig"

              sh 'rm -rf build/'
              sh 'rm -rf dist/'
              sh 'rm -rf *-iphone-*.zip'
              sh 'rm -rf metadata.json'

              sh 'carthage update --platform ios'
              sh 'cp -R Carthage/Build/iOS/*.framework platform'
            }

            sh 'npm run test:ios'

            dir('ios') {
              // 7.5.0.GA creates an empty dist dir
              //dir('dist') {
              //  archiveArtifacts '*.zip'
              //}
              archiveArtifacts '*.zip'
            }
          }
          deleteDir()
        }
      }
    ])
  }
}